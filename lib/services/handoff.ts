import "server-only";
import { withTransaction } from "@/lib/db";
import { config } from "@/lib/config";
import { SUMMARY_PROMPT_VERSION, SUMMARY_SYSTEM, transcript } from "@/lib/ai/prompts";
import { maskPII } from "@/lib/ai/guardrails";
import { insertRuns, type RunRecord } from "@/lib/repos/ai-runs";
import { markHandedOff, saveSummary, touchConversation, type HandoffReason } from "@/lib/repos/conversations";
import { insertMessage, listMessages, type MessageRow } from "@/lib/repos/messages";
import { callModel, ModelUnavailableError } from "@/lib/services/model-call";

// HANDOFF: the conversation leaves the AI and joins the human queue, with a
// reason (for analytics) and a short summary (so the agent doesn't make
// the customer repeat themselves). Triggers, all recorded:
//   customer_request    the customer asked for a person (button or words)
//   negative_sentiment  the classifier saw strong anger or distress
//   sensitive_topic     fraud, chargebacks, legal threats…
//   low_confidence      retrieval found nothing twice in a row
//   tool_failure        an order lookup failed for a technical reason

const NOTICE: Record<HandoffReason, string> = {
  customer_request: "you asked for a person",
  negative_sentiment: "this sounds frustrating, so a person will take it from here",
  sensitive_topic: "this needs a person to look at it",
  low_confidence: "I couldn't find this in our help articles",
  tool_failure: "I couldn't look up your order just now",
};

export function handoffNotice(reason: HandoffReason): string {
  return `Handed to a support agent: ${NOTICE[reason]}. The next available agent will reply here, usually within 15 minutes (8am–7pm, Mon–Sat).`;
}

/** A template summary for when the model is unavailable. */
function fallbackSummary(messages: MessageRow[], reason: HandoffReason): string {
  const customer = messages.filter((m) => m.sender_role === "customer");
  const orders = [...new Set(messages.flatMap((m) => m.content.match(/OJX-\d{6}/g) ?? []))];
  return [
    `Handoff reason: ${reason.replace("_", " ")}.`,
    `First message: ${maskPII(customer[0]?.content ?? "").slice(0, 150)}`,
    customer.length > 1 ? `Latest message: ${maskPII(customer.at(-1)?.content ?? "").slice(0, 150)}` : null,
    orders.length ? `Orders mentioned: ${orders.join(", ")}` : null,
    "(Automatic summary unavailable; template used.)",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Moves the conversation to waiting_human (only if it is still with the AI),
 * posts a system notice, then writes the summary. Returns the notice
 * message, or null if it was already handed off.
 */
export async function handOff(conversationId: string, customerId: string, reason: HandoffReason, extraRuns: RunRecord[] = []): Promise<MessageRow | null> {
  const notice = await withTransaction(async (tx) => {
    if (!(await markHandedOff(tx, conversationId, reason))) return null;
    const m = await insertMessage({ conversationId, customerId, role: "system", senderId: null, content: handoffNotice(reason) }, tx);
    await touchConversation(tx, conversationId, { firstResponse: true });
    return m;
  });
  if (!notice) {
    if (extraRuns.length) await insertRuns(extraRuns);
    return null;
  }

  const messages = await listMessages(conversationId);
  let summary: string;
  const runs = [...extraRuns];
  try {
    const result = await callModel({
      purpose: "summarise",
      fast: true,
      promptVersion: SUMMARY_PROMPT_VERSION,
      conversationId,
      system: SUMMARY_SYSTEM,
      turns: [{ role: "user", text: `Handoff reason: ${reason}\n\n${transcript(messages.slice(-config.historyMessages * 2))}` }],
      maxOutputTokens: 220,
      runExtras: { questionExcerpt: maskPII(messages.find((m) => m.sender_role === "customer")?.content ?? "").slice(0, 200) },
    });
    runs.push(...result.runs.map((r) => ({ ...r, outcome: r.outcome === "answered" ? ("handoff" as const) : r.outcome })));
    summary = result.text.trim().split("\n").filter(Boolean).slice(0, 5).join("\n") || fallbackSummary(messages, reason);
  } catch (error) {
    if (error instanceof ModelUnavailableError) runs.push(...error.runs);
    summary = fallbackSummary(messages, reason);
  }
  await saveSummary(conversationId, summary);
  await insertRuns(runs.map((r) => ({ ...r, messageId: r.messageId ?? notice.id })));
  return notice;
}
