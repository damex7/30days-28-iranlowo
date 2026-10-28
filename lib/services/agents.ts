import "server-only";
import { withTransaction, db } from "@/lib/db";
import type { Actor } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { maskOrderNumber, maskPII } from "@/lib/ai/guardrails";
import { DRAFT_PROMPT_VERSION, DRAFT_SYSTEM, referenceBlocks, transcript } from "@/lib/ai/prompts";
import { insertRuns } from "@/lib/repos/ai-runs";
import { recordAudit, listAuditFor } from "@/lib/repos/audit";
import { assignAgent, deleteDraftsOf, listCanned, listInbox, recordAgentReply, resolveByAgent, type InboxFilter } from "@/lib/repos/inbox";
import { insertMessage, listMessages, type MessageRow } from "@/lib/repos/messages";
import { listOrdersForCustomer } from "@/lib/repos/orders";
import { findUserById } from "@/lib/repos/users";
import { getConversationFor, maskForViewer } from "@/lib/services/conversations";
import { notifyCustomerOfAgentReply } from "@/lib/services/notifications";
import { requireStaff, requireWritableStaff } from "@/lib/services/permissions";
import { ConflictError, RuleError } from "@/lib/services/errors";
import { callModel, ModelUnavailableError } from "@/lib/services/model-call";
import { retrieveForAssistant } from "@/lib/services/retrieval";
import type { InboxQuery } from "@/lib/validation/agent";
import { decodeCursor, encodeCursor } from "@/lib/cursor";

// THE HUMAN IN THE LOOP. The AI drafts; a person decides. Nothing here
// sends a message the agent didn't explicitly send, and only people can
// resolve a case. Why: the model can be confidently wrong, can't see
// context outside the thread (a courier's phone call, a warehouse photo),
// and can't be held accountable. A person reading and owning each reply is
// the safety net for everything the guardrails miss.

const PAGE = 15;

export async function inbox(actor: Actor | null, q: InboxQuery) {
  const agent = requireStaff(actor);
  const c = decodeCursor(q.after, 2);
  const after = c && !Number.isNaN(Date.parse(c[0]!.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"))) && /^[0-9a-f-]{36}$/.test(c[1]!) ? { at: c[0]!, id: c[1]! } : null;
  const filter: InboxFilter = {
    statuses: q.status === "all" ? ["waiting_human", "human", "resolved", "closed", ...(agent.role === "admin" ? (["ai"] as const) : [])] : q.status === "open" ? ["waiting_human", "human"] : [q.status],
    assignedTo: q.mine ? agent.id : null,
    visibleTo: agent.role === "admin" ? null : { agentId: agent.id, readOnly: agent.isReadOnly },
    category: q.category ?? null,
    sort: q.sort,
    after,
  };
  const { rows, total } = await listInbox(filter, PAGE);
  const page = rows.slice(0, PAGE);
  const last = page.at(-1);
  const visible = agent.isReadOnly
    ? page.map((r) => ({ ...r, customer_email: maskPII(r.customer_email), customer_name: `${r.customer_name.split(" ")[0]} ${(r.customer_name.split(" ")[1] ?? "").slice(0, 1)}.`, summary: r.summary && maskPII(r.summary) }))
    : page;
  return { rows: visible, total, next: rows.length > PAGE && last ? encodeCursor([last.last_message_at, last.id]) : null, isFirstPage: !after };
}

export async function agentConversation(actor: Actor | null, id: string) {
  const agent = requireStaff(actor);
  const conversation = await getConversationFor(agent, id);
  const [messages, customer, orders, canned, audit] = await Promise.all([
    listMessages(id, { includeDrafts: true }),
    findUserById(conversation.customer_id),
    // Only the customer of THIS conversation: an agent never browses orders freely.
    listOrdersForCustomer(conversation.customer_id, 5),
    listCanned(),
    listAuditFor("conversation", id),
  ]);
  // Drafts are private to the agent who asked for them.
  const visible = messages.filter((m) => !m.is_draft || m.sender_id === agent.id);
  const masked = agent.isReadOnly;
  return {
    conversation: masked && conversation.summary ? { ...conversation, summary: maskPII(conversation.summary) } : conversation,
    messages: maskForViewer(agent, visible),
    draft: visible.findLast((m) => m.is_draft) ?? null,
    customer: customer && {
      name: masked ? `${customer.display_name.split(" ")[0]} ${(customer.display_name.split(" ")[1] ?? "").slice(0, 1)}.` : customer.display_name,
      email: masked ? maskPII(customer.email) : customer.email,
      phone: customer.phone ? (masked ? maskPII(customer.phone) : customer.phone) : null,
    },
    orders: orders.map((o) => (masked ? { ...o, order_number: maskOrderNumber(o.order_number) } : o)),
    canned,
    audit,
    canWrite: !agent.isReadOnly,
  };
}

export async function assignToMe(actor: Actor | null, id: string, version: number) {
  const agent = requireWritableStaff(actor);
  await getConversationFor(agent, id);
  await withTransaction(async (tx) => {
    if (!(await assignAgent(tx, id, agent.id, version))) throw new ConflictError("Someone else picked this up or changed it. Reload to see the latest.");
    await recordAudit(tx, agent.id, "conversation.assign", "conversation", id, { to: agent.id });
  });
}

export async function sendAgentReply(actor: Actor | null, id: string, input: { content: string; clientMessageId: string }): Promise<MessageRow | null> {
  const agent = requireWritableStaff(actor);
  const conversation = await getConversationFor(agent, id);
  if (conversation.status === "resolved" || conversation.status === "closed") throw new RuleError("This conversation is closed.");
  const message = await withTransaction(async (tx) => {
    // Sending replaces the draft: the draft row (scratch) is deleted and a
    // new, immutable message is appended, so the customer's polling cursor
    // (ids only grow) always sees it.
    await deleteDraftsOf(tx, id, agent.id);
    const m = await insertMessage(
      { conversationId: id, customerId: conversation.customer_id, role: "agent", senderId: agent.id, content: input.content, clientMessageId: input.clientMessageId },
      tx,
    );
    if (m) await recordAgentReply(tx, id, agent.id);
    return m;
  });
  if (message) await notifyCustomerOfAgentReply(id).catch((e) => console.error("[email] notify failed:", e instanceof Error ? e.message : e));
  return message;
}

/**
 * Asks the model for a reply the agent can edit. It is stored as a draft
 * (is_draft = true), visible only to this agent, and is never sent
 * automatically.
 */
export async function draftReply(actor: Actor | null, id: string): Promise<{ text: string; fromModel: boolean }> {
  const agent = requireWritableStaff(actor);
  const conversation = await getConversationFor(agent, id);
  const messages = (await listMessages(id)).slice(-config.historyMessages * 2);
  const customer = await findUserById(conversation.customer_id);
  const lastCustomer = messages.findLast((m) => m.sender_role === "customer")?.content ?? conversation.subject;
  const hits = await retrieveForAssistant(lastCustomer, 3);
  let text: string;
  let fromModel = true;
  const runs = [];
  try {
    const result = await callModel({
      purpose: "draft_reply",
      promptVersion: DRAFT_PROMPT_VERSION,
      conversationId: id,
      system: DRAFT_SYSTEM,
      turns: [
        {
          role: "user",
          text: `Customer name: ${customer?.display_name.split(" ")[0] ?? "Customer"}\nHandoff summary:\n${maskPII(conversation.summary ?? "(none)")}\n\n${referenceBlocks(hits)}\n\nConversation:\n${transcript(messages)}`,
        },
      ],
      maxOutputTokens: 300,
      runExtras: { retrievedChunkIds: hits.map((h) => h.chunkId), retrievalTopScore: hits[0]?.score ?? null, questionExcerpt: maskPII(lastCustomer).slice(0, 200) },
    });
    runs.push(...result.runs);
    text = result.text.trim();
  } catch (error) {
    if (error instanceof ModelUnavailableError) runs.push(...error.runs);
    text = "";
  }
  if (!text) {
    fromModel = false;
    text = `Hello ${customer?.display_name.split(" ")[0] ?? "there"}, thanks for waiting. I'm looking into this for you now.`;
  }
  const draft = await withTransaction(async (tx) => {
    await deleteDraftsOf(tx, id, agent.id);
    return insertMessage({ conversationId: id, customerId: conversation.customer_id, role: "agent", senderId: agent.id, content: text.slice(0, 2000), isDraft: true }, tx);
  });
  await insertRuns(runs.map((r) => ({ ...r, messageId: draft?.id ?? null })));
  return { text, fromModel };
}

export async function resolveConversation(actor: Actor | null, id: string, version: number) {
  const agent = requireWritableStaff(actor);
  const conversation = await getConversationFor(agent, id);
  // "Resolved" must mean a person actually answered. The database trigger
  // enforces the same rule; checking here gives a clear message.
  const trail = await db.query(`SELECT 1 FROM messages WHERE conversation_id = $1 AND sender_role = 'agent' AND NOT is_draft LIMIT 1`, [id]);
  if (trail.length === 0) throw new RuleError("Reply to the customer before resolving: there's no agent message in this conversation yet.");
  if (conversation.status !== "waiting_human" && conversation.status !== "human") throw new RuleError("Only open conversations can be resolved.");
  await withTransaction(async (tx) => {
    if (!(await resolveByAgent(tx, id, version))) throw new ConflictError();
    await deleteDraftsOf(tx, id, agent.id);
    await recordAudit(tx, agent.id, "conversation.resolve", "conversation", id, {});
  });
}
