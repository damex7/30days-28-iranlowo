import "server-only";
import type { Actor } from "@/lib/auth/session";
import { maskPII } from "@/lib/ai/guardrails";
import {
  findConversation,
  findCustomerConversation,
  listCustomerConversations,
  markSeenByCustomer,
  resolveByCustomer,
  saveCsat,
  type ConversationRow,
} from "@/lib/repos/conversations";
import { listMessages, type MessageRow } from "@/lib/repos/messages";
import { isStaff, requireCustomer, requireUser } from "@/lib/services/permissions";
import { NotFoundError, RuleError } from "@/lib/services/errors";

/**
 * Who may see a conversation:
 *   customer -> only their own;
 *   agent    -> the human queue (waiting, unassigned) and conversations
 *               assigned to them; never another agent's case or one the AI
 *               is still handling;
 *   demo agent (read-only) -> every conversation in the human queue or
 *               handled by people, masked, so the tour has something to show;
 *   admin    -> everything.
 * Anything else is reported as "not found", never "forbidden".
 */
export function staffCanSee(actor: Actor, c: ConversationRow): boolean {
  if (actor.role === "admin") return true;
  if (actor.role !== "agent") return false;
  if (actor.isReadOnly) return c.status !== "ai";
  return c.assigned_agent_id === actor.id || (c.assigned_agent_id === null && c.status === "waiting_human");
}

export async function getConversationFor(actor: Actor | null, id: string): Promise<ConversationRow> {
  const a = requireUser(actor);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError();
  const c = a.role === "customer" ? await findCustomerConversation(a.id, id) : await findConversation(id);
  if (!c || (a.role !== "customer" && !staffCanSee(a, c))) throw new NotFoundError();
  return c;
}

/** Masks message text for the read-only demo agent. */
export const maskForViewer = (actor: Actor, messages: MessageRow[]) =>
  actor.isReadOnly ? messages.map((m) => ({ ...m, content: maskPII(m.content) })) : messages;

export async function getCustomerChat(actor: Actor | null, id: string) {
  const customer = requireCustomer(actor);
  const conversation = await getConversationFor(customer, id);
  const messages = await listMessages(id, { ratedBy: customer.id });
  await markSeenByCustomer(id);
  return { conversation, messages };
}

export async function listMyConversations(actor: Actor | null) {
  const customer = requireCustomer(actor);
  return listCustomerConversations(customer.id);
}

/**
 * Polling: new messages after `since`. Customers never get drafts; staff
 * see drafts only when they can edit (drafts belong to the agent composer).
 */
export async function pollConversation(actor: Actor | null, id: string, since: number) {
  const a = requireUser(actor);
  const conversation = await getConversationFor(a, id);
  const messages = await listMessages(id, { since, includeDrafts: false, ratedBy: a.role === "customer" ? a.id : null });
  if (a.role === "customer") await markSeenByCustomer(id);
  return { status: conversation.status, assignedAgentName: conversation.assigned_agent_name, messages: isStaff(a) ? maskForViewer(a, messages) : messages };
}

export async function resolveMyConversation(actor: Actor | null, id: string) {
  const customer = requireCustomer(actor);
  await getConversationFor(customer, id);
  const updated = await resolveByCustomer(id, customer.id);
  if (!updated) throw new RuleError("This conversation is already closed.");
  return updated;
}

export async function rateConversation(actor: Actor | null, id: string, rating: number, comment: string | null) {
  const customer = requireCustomer(actor);
  await getConversationFor(customer, id);
  if (!(await saveCsat(id, customer.id, rating, comment))) throw new RuleError("You can rate a conversation once it's resolved.");
}
