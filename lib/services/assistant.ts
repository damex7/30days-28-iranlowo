import "server-only";
import { z } from "zod";
import type { Actor } from "@/lib/auth/session";
import { config } from "@/lib/config";
import type { Turn } from "@/lib/ai/provider";
import { TOOL_DEFINITIONS, ORDER_NUMBER } from "@/lib/ai/tools";
import { asksForHuman, capAnswer, keywordFlags, questionExcerpt } from "@/lib/ai/guardrails";
import {
  ANSWER_PROMPT_VERSION,
  CLASSIFY_PROMPT_VERSION,
  CLASSIFY_SYSTEM,
  SYSTEM_PROMPT,
  answerUserTurn,
  classifyUserTurn,
  historyText,
} from "@/lib/ai/prompts";
import { insertRuns, type RunRecord } from "@/lib/repos/ai-runs";
import { db } from "@/lib/db";
import {
  findConversation,
  findCustomerConversation,
  insertConversation,
  setLowConfidenceStreak,
  touchConversation,
  type ConversationRow,
  type ConversationStatus,
  type HandoffReason,
} from "@/lib/repos/conversations";
import {
  countCustomerMessagesIn,
  countCustomerMessagesToday,
  findByClientId,
  findMessage,
  findReplyTo,
  insertMessage,
  recentForPrompt,
  type Citation,
  type MessageRow,
} from "@/lib/repos/messages";
import { requireCustomer } from "@/lib/services/permissions";
import { enforce } from "@/lib/services/rate-limit";
import { NotFoundError, RateLimitedError, RuleError } from "@/lib/services/errors";
import { retrieveForAssistant, type SearchHit } from "@/lib/services/retrieval";
import { executeTool, ToolFailure } from "@/lib/services/tools";
import { handOff } from "@/lib/services/handoff";
import { ModelUnavailableError, callModel, streamModel } from "@/lib/services/model-call";

// THE ASSISTANT: one customer message's journey, from checks to a saved and
// streamed answer (or a handoff). The order matters:
//   1. checks that cost nothing: role, rate limit, caps, conversation state;
//   2. the customer's message is SAVED before any model call, so a crash,
//      timeout or closed tab never loses what they wrote, and the unique
//      client_message_id is claimed before we spend a single token;
//   3. cheap routing: an explicit request for a person, then a classifier
//      on the fast model (sentiment, sensitive topics);
//   4. retrieval: no good chunk -> "I don't know" (twice -> a person);
//   5. the answer model, with tools, in a bounded loop;
//   6. save the answer (partial + interrupted if the customer left), log
//      every model call in ai_runs.

export const chatInputSchema = z.object({
  conversationId: z.uuid(),
  clientMessageId: z.uuid(),
  text: z.string().trim().min(1, "Type a message first.").max(config.maxMessageLength, `Keep messages under ${config.maxMessageLength} characters.`),
  requestHuman: z.boolean().optional().default(false),
});
export type ChatInput = z.infer<typeof chatInputSchema>;

export type ChatEvent =
  | { type: "meta"; conversationId: string; customerMessage: MessageRow; duplicate: boolean }
  | { type: "delta"; text: string }
  | { type: "done"; messages: MessageRow[]; status: ConversationStatus; offerHuman: boolean };

const DONT_KNOW = "I'm not sure about that, and I'd rather not guess. Could you rephrase it, or would you like me to connect you with a person?";
const TROUBLE = "Sorry, I'm having trouble answering right now. Your message is saved. You can try again in a moment, or tap “Talk to a person”.";
const LOOP_STOP = "I couldn't finish looking that up. Would you like me to connect you with a person?";
const FALLBACK_NOTE = "\n\n(Our assistant is very busy, so this is a shorter automatic answer. Tap “Talk to a person” if it doesn't help.)";

const classificationSchema = z.object({
  sentiment: z.enum(["positive", "neutral", "negative", "very_negative"]).catch("neutral"),
  sensitive: z.boolean().catch(false),
});

/** Mentions of orders: we still call the model (tools may answer) even with no retrieved chunk. */
const ORDER_INTENT = /\bOJX-?\s?\d{6}\b|\b(my|recent)\s+orders?\b|\bwhere('s| is) my\b|\border status\b/i;

type Prepared = { conversation: ConversationRow; message: MessageRow; duplicate: boolean };

/**
 * Everything that can fail with a normal HTTP error happens here, before
 * the stream starts: the route turns these throws into 4xx JSON.
 */
export async function prepareCustomerMessage(actor: Actor | null, input: ChatInput): Promise<Prepared> {
  const customer = requireCustomer(actor);
  // Per-minute limit on the route: stops scripts and runaway retries.
  await enforce(`chat:user:${customer.id}`, config.chatPerMinute, 60, "You're sending messages very fast. Please wait a moment.");

  await insertConversation(input.conversationId, customer.id, input.text.replace(/\s+/g, " ").slice(0, 80));
  const conversation = await findCustomerConversation(customer.id, input.conversationId);
  if (!conversation) throw new NotFoundError();

  // Idempotency: the same clientMessageId again (double tap, retry after a
  // dropped connection) returns the original message and makes no model call.
  const existing = await findByClientId(conversation.id, input.clientMessageId);
  if (existing) {
    const message = await findMessage(existing.id);
    if (message) return { conversation, message, duplicate: true };
  }

  if (conversation.status === "resolved" || conversation.status === "closed") {
    throw new RuleError("This conversation is closed. Start a new chat and we'll pick it up from there.");
  }
  // Caps: each customer message can cost several model calls, and the free
  // tier allows only a few hundred calls a day for everyone together.
  if ((await countCustomerMessagesToday(customer.id)) >= config.dailyMessageCap) {
    throw new RateLimitedError(`You've reached today's limit of ${config.dailyMessageCap} messages. Our agents can still help: tap “Talk to a person”.`, 3600);
  }
  if ((await countCustomerMessagesIn(conversation.id)) >= config.conversationMessageCap && !input.requestHuman) {
    throw new RuleError("This conversation is getting long. Tap “Talk to a person” and an agent will take over.");
  }

  const message = await insertMessage({
    conversationId: conversation.id,
    customerId: customer.id,
    role: "customer",
    senderId: customer.id,
    content: input.text,
    clientMessageId: input.clientMessageId,
  });
  if (!message) {
    // Lost a race with an identical request: treat as the duplicate it is.
    const again = await findByClientId(conversation.id, input.clientMessageId);
    const original = again && (await findMessage(again.id));
    if (!original) throw new NotFoundError();
    return { conversation, message: original, duplicate: true };
  }
  await touchConversation(db, conversation.id, { customerSeen: true });
  return { conversation, message, duplicate: false };
}

function citationsFrom(text: string, hits: SearchHit[]): Citation[] {
  const used = new Set([...text.matchAll(/\[(\d)\]/g)].map((m) => Number(m[1])));
  return hits
    .map((h, i) => ({ ref: i + 1, hit: h }))
    .filter(({ ref }) => used.has(ref))
    .map(({ ref, hit: h }) => ({ ref, chunkId: h.chunkId, slug: h.slug, title: h.title, anchor: h.anchor }));
}

async function buildTurns(conversationId: string, beforeId: number, finalUserText: string): Promise<Turn[]> {
  const history = await recentForPrompt(conversationId, beforeId, config.historyMessages);
  const turns: Turn[] = [];
  for (const m of history) {
    const role = m.sender_role === "customer" ? "user" : "assistant";
    const text = historyText(m.sender_role, m.content);
    const last = turns.at(-1);
    // Merge same-role neighbours: providers expect alternating turns.
    if (last && last.role === role && (last.role === "user" || last.role === "assistant")) last.text += `\n\n${text}`;
    else if (role === "user") turns.push({ role, text });
    else if (turns.length > 0) turns.push({ role: "assistant", text });
  }
  const last = turns.at(-1);
  if (last?.role === "user") last.text += `\n\n${finalUserText}`;
  else turns.push({ role: "user", text: finalUserText });
  return turns;
}

/** The streamed part. Every path ends in exactly one "done" event. */
export async function* runAssistant(actor: Actor, prepared: Prepared, input: ChatInput, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  const { conversation, message } = prepared;
  yield { type: "meta", conversationId: conversation.id, customerMessage: message, duplicate: prepared.duplicate };

  const finish = async (messages: MessageRow[], offerHuman: boolean): Promise<ChatEvent> => {
    const fresh = await findConversation(conversation.id);
    return { type: "done", messages, status: fresh?.status ?? conversation.status, offerHuman };
  };

  if (prepared.duplicate) {
    const reply = await findReplyTo(message.id);
    yield await finish(reply ? [reply] : [], false);
    return;
  }
  // With a person: the message is saved and the agent's inbox will show it.
  if (conversation.status !== "ai") {
    yield await finish([], false);
    return;
  }

  const text = input.text;
  const excerpt = questionExcerpt(text);
  const runs: RunRecord[] = [];
  const handoffWith = async (reason: HandoffReason, before: MessageRow[] = []) => {
    const notice = await handOff(conversation.id, conversation.customer_id, reason, runs.map((r) => ({ ...r, messageId: r.messageId ?? message.id })));
    return finish([...before, ...(notice ? [notice] : [])], false);
  };

  // 3a. Asked for a person: no model needed.
  if (input.requestHuman || asksForHuman(text)) {
    yield await handoffWith("customer_request");
    return;
  }

  // 3b. Classifier on the cheap model. If it is unavailable, the keyword
  // check still runs, and we carry on rather than block the customer.
  const keywords = keywordFlags(text);
  let sentiment: z.infer<typeof classificationSchema> = { sentiment: keywords.negative ? "very_negative" : "neutral", sensitive: keywords.sensitive };
  try {
    const result = await callModel({
      purpose: "classify",
      fast: true,
      json: true,
      promptVersion: CLASSIFY_PROMPT_VERSION,
      conversationId: conversation.id,
      system: CLASSIFY_SYSTEM,
      turns: [{ role: "user", text: classifyUserTurn(text) }],
      maxOutputTokens: 60,
      signal,
      runExtras: { questionExcerpt: excerpt },
    });
    runs.push(...result.runs);
    const json = result.text.replace(/^```(json)?|```$/g, "").trim();
    const parsed = classificationSchema.safeParse(JSON.parse(json || "{}"));
    if (parsed.success) sentiment = { sentiment: parsed.data.sentiment, sensitive: parsed.data.sensitive || keywords.sensitive };
  } catch (error) {
    if (error instanceof ModelUnavailableError) runs.push(...error.runs);
  }
  if (sentiment.sensitive) {
    yield await handoffWith("sensitive_topic");
    return;
  }
  if (sentiment.sentiment === "very_negative") {
    yield await handoffWith("negative_sentiment");
    return;
  }

  // 4. Retrieval.
  const hits = await retrieveForAssistant(text, config.contextChunks);
  const retrievalExtras = { retrievedChunkIds: hits.map((h) => h.chunkId), retrievalTopScore: hits[0]?.score ?? null, questionExcerpt: excerpt };
  if (hits.length === 0 && !ORDER_INTENT.test(text)) {
    // Nothing in the knowledge base: say so, never guess. Twice in a row -> a person.
    const streak = conversation.low_conf_streak + 1;
    if (streak >= 2) {
      await setLowConfidenceStreak(conversation.id, 0);
      const reply = await saveAssistant("I still can't find this in our help articles, so I've asked a person to help.", [], false);
      yield await handoffWith("low_confidence", reply ? [reply] : []);
      return;
    }
    await setLowConfidenceStreak(conversation.id, streak);
    for (const word of DONT_KNOW.match(/\S+\s*/g) ?? []) yield { type: "delta", text: word };
    const reply = await saveAssistant(DONT_KNOW, [], false);
    yield await finish(reply ? [reply] : [], true);
    return;
  }
  if (conversation.low_conf_streak > 0) await setLowConfidenceStreak(conversation.id, 0);

  // 5. Answer with tools. Native mode sends tool definitions to the model;
  // "server" mode (AI_TOOL_MODE=server) is the fallback for models with
  // weak function calling: the server spots order questions itself.
  const serverTools = process.env.AI_TOOL_MODE === "server";
  let finalUser = answerUserTurn(text, hits);
  if (serverTools) finalUser = (await serverToolBlock(actor, text)) + finalUser;
  const turns = await buildTurns(conversation.id, message.id, finalUser);

  let answer = "";
  let fellBack = false;
  let handoffReason: HandoffReason | null = null;
  let stoppedByLoopCap = false;
  const toolsCalled: { name: string; args: unknown; ok: boolean }[] = [];
  try {
    for (let iteration = 0; ; iteration++) {
      // Bounded loop: a confused or manipulated model can't make us call
      // tools forever (each call costs quota and latency).
      if (iteration >= config.maxToolIterations + 1) {
        stoppedByLoopCap = true;
        break;
      }
      const gen = streamModel({
        purpose: "answer",
        promptVersion: ANSWER_PROMPT_VERSION,
        conversationId: conversation.id,
        system: SYSTEM_PROMPT,
        turns,
        tools: serverTools || iteration >= config.maxToolIterations ? undefined : TOOL_DEFINITIONS,
        maxOutputTokens: config.maxOutputTokens,
        signal,
        runExtras: { ...retrievalExtras, toolsCalled },
      });
      let step = await gen.next();
      while (!step.done) {
        // Output length cap, enforced on the stream itself.
        if (answer.length < config.maxAnswerChars) yield { type: "delta", text: step.value };
        answer += step.value;
        step = await gen.next();
      }
      const result = step.value;
      runs.push(...result.runs);
      fellBack ||= result.fellBack;
      if (result.toolCalls.length === 0) break;
      if (iteration >= config.maxToolIterations) {
        stoppedByLoopCap = true;
        break;
      }

      turns.push({ role: "assistant", text: result.text, toolCalls: result.toolCalls, providerState: result.providerState });
      const results = [];
      for (const call of result.toolCalls.slice(0, 3)) {
        const outcome = await executeTool(actor, call);
        toolsCalled.push({ name: outcome.name, args: outcome.loggedArgs, ok: outcome.ok });
        if (outcome.handoff) handoffReason = outcome.handoff;
        results.push({ callId: outcome.callId, name: outcome.name, result: outcome.result });
      }
      if (handoffReason) break;
      turns.push({ role: "tool", results });
    }
  } catch (error) {
    if (error instanceof ToolFailure) {
      handoffReason = "tool_failure";
    } else if (error instanceof ModelUnavailableError) {
      runs.push(...error.runs);
      if (signal.aborted) {
        // The customer pressed Stop or left: keep what was said, marked interrupted.
        const partial = await saveAssistant(capAnswer(answer, config.maxAnswerChars), citationsFrom(answer, hits), true);
        yield await finish(partial ? [partial] : [], false);
        return;
      }
      const reply = await saveAssistant(answer ? `${capAnswer(answer, config.maxAnswerChars)}\n\n${TROUBLE}` : TROUBLE, citationsFrom(answer, hits), !!answer);
      yield { type: "delta", text: `${answer ? "\n\n" : ""}${TROUBLE}` };
      yield await finish(reply ? [reply] : [], true);
      return;
    } else {
      throw error;
    }
  }

  if (handoffReason) {
    const before = answer.trim() ? await saveAssistant(capAnswer(answer.trim(), config.maxAnswerChars), citationsFrom(answer, hits), false) : null;
    markLastOutcome("handoff");
    yield await handoffWith(handoffReason, before ? [before] : []);
    return;
  }

  let final = capAnswer(answer.trim(), config.maxAnswerChars) || DONT_KNOW;
  if (!answer.trim()) yield { type: "delta", text: DONT_KNOW };
  if (stoppedByLoopCap) {
    final = `${final === DONT_KNOW ? "" : `${final}\n\n`}${LOOP_STOP}`;
    yield { type: "delta", text: `\n\n${LOOP_STOP}` };
  }
  if (fellBack) {
    final += FALLBACK_NOTE;
    yield { type: "delta", text: FALLBACK_NOTE };
  }
  const reply = await saveAssistant(final, citationsFrom(final, hits), signal.aborted);
  yield await finish(reply ? [reply] : [], fellBack || stoppedByLoopCap || final === DONT_KNOW);

  // ── helpers that close over this turn ──
  function markLastOutcome(outcome: RunRecord["outcome"]) {
    const last = runs.findLast((r) => r.purpose === "answer");
    if (last) last.outcome = outcome;
  }

  async function saveAssistant(content: string, citations: Citation[], interrupted: boolean): Promise<MessageRow | null> {
    const saved = await insertMessage({
      conversationId: conversation.id,
      customerId: conversation.customer_id,
      role: "assistant",
      senderId: null,
      content,
      citations,
      inReplyTo: message.id,
      interrupted,
    });
    await touchConversation(db, conversation.id, { firstResponse: true });
    // Every model call of this turn is logged against the answer it produced.
    const toLog = runs.splice(0, runs.length).map((r) => ({ ...r, messageId: saved?.id ?? message.id }));
    await insertRuns(toLog);
    return saved;
  }
}

/** AI_TOOL_MODE=server: run the read-only lookups ourselves and pass results as data. */
async function serverToolBlock(actor: Actor, text: string): Promise<string> {
  const number = /\bOJX-?\s?(\d{6})\b/i.exec(text);
  const call = number
    ? { id: "server_1", name: "get_order_status", args: { order_number: `OJX-${number[1]}` } }
    : /\b(my|recent)\s+orders?\b/i.test(text)
      ? { id: "server_1", name: "list_my_recent_orders", args: {} }
      : null;
  if (!call || !ORDER_NUMBER.test(String((call.args as { order_number?: string }).order_number ?? "OJX-000000"))) return "";
  const outcome = await executeTool(actor, call);
  return `<tool_result name="${outcome.name}">\n${JSON.stringify(outcome.result)}\n</tool_result>\n\n`;
}
