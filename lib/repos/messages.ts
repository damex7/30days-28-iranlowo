import "server-only";
import { db, type Db } from "@/lib/db";

export type SenderRole = "customer" | "assistant" | "agent" | "system";
/** ref is the [n] marker used in the answer text. */
export type Citation = { ref: number; chunkId: number; slug: string; title: string; anchor: string };

export type MessageRow = {
  id: number;
  conversation_id: string;
  sender_role: SenderRole;
  sender_id: string | null;
  sender_name: string | null;
  content: string;
  citations: Citation[];
  is_draft: boolean;
  interrupted: boolean;
  in_reply_to: number | null;
  created_at: string;
  my_rating: "up" | "down" | null;
};

const COLUMNS = `m.id::int, m.conversation_id, m.sender_role, m.sender_id, u.display_name AS sender_name, m.content, m.citations,
  m.is_draft, m.interrupted, m.in_reply_to::int, m.created_at::text`;

/**
 * Messages of one conversation, oldest first. `since` is the polling
 * cursor: ids only grow, so "id > since" returns exactly what's new.
 * Drafts are excluded unless asked for (customers never see them).
 */
export async function listMessages(conversationId: string, opts: { since?: number; includeDrafts?: boolean; ratedBy?: string | null } = {}): Promise<MessageRow[]> {
  return db.query<MessageRow>(
    `SELECT ${COLUMNS},
            (SELECT f.rating FROM message_feedback f WHERE f.message_id = m.id AND f.user_id = $4) AS my_rating
       FROM messages m LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1 AND m.id > $2 AND ($3 OR NOT m.is_draft)
      ORDER BY m.id
      LIMIT 200`,
    [conversationId, opts.since ?? 0, !!opts.includeDrafts, opts.ratedBy ?? null],
  );
}

export async function recentForPrompt(conversationId: string, beforeId: number, limit: number) {
  const rows = await db.query<{ sender_role: SenderRole; content: string }>(
    `SELECT sender_role, content FROM messages
      WHERE conversation_id = $1 AND id < $2 AND NOT is_draft AND sender_role IN ('customer', 'assistant', 'agent')
      ORDER BY id DESC LIMIT $3`,
    [conversationId, beforeId, limit],
  );
  return rows.reverse();
}

export type NewMessage = {
  conversationId: string;
  customerId: string;
  role: SenderRole;
  senderId: string | null;
  content: string;
  citations?: Citation[];
  clientMessageId?: string | null;
  inReplyTo?: number | null;
  interrupted?: boolean;
  isDraft?: boolean;
};

/**
 * Inserts a message. With a clientMessageId, a duplicate (double tap,
 * network retry) hits the unique constraint and returns null instead of a
 * second row.
 */
export async function insertMessage(m: NewMessage, q: Db = db): Promise<MessageRow | null> {
  const rows = await q.query<MessageRow>(
    `WITH ins AS (
       INSERT INTO messages (conversation_id, customer_id, sender_role, sender_id, content, citations, client_message_id, in_reply_to, interrupted, is_draft)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
       ON CONFLICT (conversation_id, client_message_id) DO NOTHING
       RETURNING *
     )
     SELECT ins.id::int, ins.conversation_id, ins.sender_role, ins.sender_id, u.display_name AS sender_name, ins.content, ins.citations,
            ins.is_draft, ins.interrupted, ins.in_reply_to::int, ins.created_at::text, NULL::text AS my_rating
       FROM ins LEFT JOIN users u ON u.id = ins.sender_id`,
    [
      m.conversationId,
      m.customerId,
      m.role,
      m.senderId,
      m.content,
      JSON.stringify(m.citations ?? []),
      m.clientMessageId ?? null,
      m.inReplyTo ?? null,
      !!m.interrupted,
      !!m.isDraft,
    ],
  );
  return rows[0] ?? null;
}

export async function findByClientId(conversationId: string, clientMessageId: string) {
  const rows = await db.query<{ id: number }>(`SELECT id::int FROM messages WHERE conversation_id = $1 AND client_message_id = $2`, [conversationId, clientMessageId]);
  return rows[0] ?? null;
}

export async function findReplyTo(messageId: number): Promise<MessageRow | null> {
  const rows = await db.query<MessageRow>(
    `SELECT ${COLUMNS}, NULL::text AS my_rating FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.in_reply_to = $1 ORDER BY m.id LIMIT 1`,
    [messageId],
  );
  return rows[0] ?? null;
}

export async function findMessage(id: number): Promise<(MessageRow & { customer_id: string }) | null> {
  const rows = await db.query<MessageRow & { customer_id: string }>(
    `SELECT ${COLUMNS}, m.customer_id, NULL::text AS my_rating FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Customer messages today (Lagos calendar day), for the daily cap. */
export async function countCustomerMessagesToday(customerId: string): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM messages
      WHERE customer_id = $1 AND sender_role = 'customer'
        AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos')`,
    [customerId],
  );
  return rows[0]?.n ?? 0;
}

export async function countCustomerMessagesIn(conversationId: string): Promise<number> {
  const rows = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1 AND sender_role = 'customer'`, [conversationId]);
  return rows[0]?.n ?? 0;
}
