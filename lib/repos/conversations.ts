import "server-only";
import { db, type Db } from "@/lib/db";

export type ConversationStatus = "ai" | "waiting_human" | "human" | "resolved" | "closed";
export type HandoffReason = "low_confidence" | "customer_request" | "negative_sentiment" | "sensitive_topic" | "tool_failure";

export type ConversationRow = {
  id: string;
  customer_id: string;
  subject: string;
  status: ConversationStatus;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  handoff_reason: HandoffReason | null;
  handed_off_at: string | null;
  summary: string | null;
  low_conf_streak: number;
  first_response_at: string | null;
  resolved_at: string | null;
  resolved_by: "ai" | "agent" | "customer" | null;
  csat_rating: number | null;
  csat_comment: string | null;
  last_message_at: string;
  created_at: string;
  version: number;
};

const COLUMNS = `c.id, c.customer_id, c.subject, c.status, c.assigned_agent_id, a.display_name AS assigned_agent_name, c.handoff_reason,
  c.handed_off_at::text, c.summary, c.low_conf_streak, c.first_response_at::text, c.resolved_at::text, c.resolved_by,
  c.csat_rating, c.csat_comment, c.last_message_at::text, c.created_at::text, c.version`;
const FROM = `FROM conversations c LEFT JOIN users a ON a.id = c.assigned_agent_id`;

export async function findConversation(id: string, q: Db = db): Promise<ConversationRow | null> {
  const rows = await q.query<ConversationRow>(`SELECT ${COLUMNS} ${FROM} WHERE c.id = $1`, [id]);
  return rows[0] ?? null;
}

/** The customer-scoped lookup: someone else's conversation simply isn't found. */
export async function findCustomerConversation(customerId: string, id: string): Promise<ConversationRow | null> {
  const rows = await db.query<ConversationRow>(`SELECT ${COLUMNS} ${FROM} WHERE c.id = $1 AND c.customer_id = $2`, [id, customerId]);
  return rows[0] ?? null;
}

/**
 * Creates the conversation with a client-generated id. ON CONFLICT DO
 * NOTHING makes a retried first message safe; the caller then re-reads with
 * the customer filter, so a guessed id that belongs to someone else is "not found".
 */
export async function insertConversation(id: string, customerId: string, subject: string): Promise<void> {
  await db.query(`INSERT INTO conversations (id, customer_id, subject) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, [id, customerId, subject]);
}

export async function listCustomerConversations(customerId: string) {
  return db.query<ConversationRow & { message_count: number; last_preview: string | null }>(
    `SELECT ${COLUMNS},
            (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND NOT m.is_draft) AS message_count,
            (SELECT left(m.content, 120) FROM messages m WHERE m.conversation_id = c.id AND NOT m.is_draft AND m.sender_role <> 'system' ORDER BY m.id DESC LIMIT 1) AS last_preview
       ${FROM} WHERE c.customer_id = $1 ORDER BY c.last_message_at DESC LIMIT 50`,
    [customerId],
  );
}

export async function touchConversation(q: Db, id: string, opts: { firstResponse?: boolean; customerSeen?: boolean } = {}) {
  await q.query(
    `UPDATE conversations
        SET last_message_at = now(),
            first_response_at = CASE WHEN $2 THEN COALESCE(first_response_at, now()) ELSE first_response_at END,
            customer_last_seen_at = CASE WHEN $3 THEN now() ELSE customer_last_seen_at END
      WHERE id = $1`,
    [id, !!opts.firstResponse, !!opts.customerSeen],
  );
}

export async function setLowConfidenceStreak(id: string, streak: number) {
  await db.query(`UPDATE conversations SET low_conf_streak = $2 WHERE id = $1`, [id, streak]);
}

/** Moves an AI conversation to the human queue. Only from 'ai', so a double handoff is a no-op. */
export async function markHandedOff(q: Db, id: string, reason: HandoffReason): Promise<boolean> {
  const rows = await q.query(
    `UPDATE conversations SET status = 'waiting_human', handoff_reason = $2, handed_off_at = now(), version = version + 1
      WHERE id = $1 AND status = 'ai' RETURNING id`,
    [id, reason],
  );
  return rows.length > 0;
}

export async function saveSummary(id: string, summary: string) {
  await db.query(`UPDATE conversations SET summary = $2 WHERE id = $1`, [id, summary.slice(0, 1200)]);
}

export async function markSeenByCustomer(id: string) {
  await db.query(`UPDATE conversations SET customer_last_seen_at = now() WHERE id = $1`, [id]);
}

/** Customer says "that solved it". From 'ai' it counts as an AI resolution. */
export async function resolveByCustomer(id: string, customerId: string): Promise<ConversationRow | null> {
  const rows = await db.query<{ id: string }>(
    `UPDATE conversations
        SET status = 'resolved', resolved_at = now(),
            resolved_by = CASE WHEN status = 'ai' AND handed_off_at IS NULL THEN 'ai' ELSE 'customer' END,
            version = version + 1
      WHERE id = $1 AND customer_id = $2 AND status IN ('ai', 'waiting_human', 'human')
      RETURNING id`,
    [id, customerId],
  );
  return rows[0] ? findConversation(id) : null;
}

export async function saveCsat(id: string, customerId: string, rating: number, comment: string | null): Promise<boolean> {
  const rows = await db.query(
    `UPDATE conversations SET csat_rating = $3, csat_comment = $4
      WHERE id = $1 AND customer_id = $2 AND status IN ('resolved', 'closed') RETURNING id`,
    [id, customerId, rating, comment],
  );
  return rows.length > 0;
}
