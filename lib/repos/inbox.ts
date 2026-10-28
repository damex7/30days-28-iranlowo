import "server-only";
import { db, type Db } from "@/lib/db";
import type { ConversationStatus } from "@/lib/repos/conversations";

export type InboxRow = {
  id: string;
  subject: string;
  status: ConversationStatus;
  customer_name: string;
  customer_email: string;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  handoff_reason: string | null;
  handed_off_at: string | null;
  last_message_at: string;
  waiting_minutes: number | null;
  summary: string | null;
  topic: string | null;
};

export type InboxFilter = {
  statuses: ConversationStatus[];
  /** Agent id to restrict to "assigned to me", or null. */
  assignedTo: string | null;
  /** For agents (not admins): only the queue + their own. */
  visibleTo: { agentId: string; readOnly: boolean } | null;
  category: string | null;
  sort: "waiting" | "newest";
  after: { at: string; id: string } | null;
};

// "waiting" = oldest last_message_at first (longest wait on top);
// "newest" = newest first. Both are keyset-paginated on
// (last_message_at, id), with id as the tie-breaker so rows with the same
// timestamp keep a stable order and are never skipped or repeated.
export async function listInbox(f: InboxFilter, limit: number): Promise<{ rows: InboxRow[]; total: number }> {
  const asc = f.sort === "waiting";
  const params = [
    f.statuses,
    f.assignedTo,
    f.visibleTo?.agentId ?? null,
    f.visibleTo?.readOnly ?? false,
    f.category,
    f.after?.at ?? null,
    f.after?.id ?? null,
    limit + 1,
  ];
  const where = `
    c.status = ANY($1::text[])
    AND ($2::uuid IS NULL OR c.assigned_agent_id = $2)
    AND ($3::uuid IS NULL OR $4::boolean OR c.assigned_agent_id = $3 OR (c.assigned_agent_id IS NULL AND c.status = 'waiting_human'))
    AND ($4::boolean = false OR c.status <> 'ai')
    AND ($5::text IS NULL OR topic.category = $5)`;
  const topicJoin = `
    LEFT JOIN LATERAL (
      SELECT a.category FROM ai_runs r JOIN article_chunks ch ON ch.id = r.retrieved_chunk_ids[1] JOIN articles a ON a.id = ch.article_id
       WHERE r.conversation_id = c.id AND r.purpose = 'answer' AND cardinality(r.retrieved_chunk_ids) > 0
       ORDER BY r.id LIMIT 1
    ) topic ON true`;
  const rows = await db.query<InboxRow>(
    `SELECT c.id, c.subject, c.status, u.display_name AS customer_name, u.email::text AS customer_email,
            c.assigned_agent_id, ag.display_name AS assigned_agent_name, c.handoff_reason, c.handed_off_at::text,
            c.last_message_at::text,
            CASE WHEN c.status = 'waiting_human' THEN floor(extract(epoch FROM now() - c.handed_off_at) / 60)::int END AS waiting_minutes,
            c.summary, topic.category AS topic
       FROM conversations c
       JOIN users u ON u.id = c.customer_id
       LEFT JOIN users ag ON ag.id = c.assigned_agent_id
       ${topicJoin}
      WHERE ${where}
        AND ($6::timestamptz IS NULL OR (c.last_message_at, c.id) ${asc ? ">" : "<"} ($6::timestamptz, $7::uuid))
      ORDER BY c.last_message_at ${asc ? "ASC" : "DESC"}, c.id ${asc ? "ASC" : "DESC"}
      LIMIT $8`,
    params,
  );
  const count = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM conversations c ${topicJoin} WHERE ${where}`,
    params.slice(0, 5),
  );
  return { rows, total: count[0]?.n ?? 0 };
}

export async function assignAgent(q: Db, id: string, agentId: string, version: number): Promise<boolean> {
  const rows = await q.query(
    `UPDATE conversations
        SET assigned_agent_id = $2, status = CASE WHEN status = 'waiting_human' THEN 'human' ELSE status END, version = version + 1
      WHERE id = $1 AND version = $3 AND status IN ('waiting_human', 'human')
      RETURNING id`,
    [id, agentId, version],
  );
  return rows.length > 0;
}

/** First agent reply moves a waiting conversation to 'human' and assigns it. */
export async function recordAgentReply(q: Db, id: string, agentId: string) {
  await q.query(
    `UPDATE conversations
        SET status = CASE WHEN status IN ('waiting_human', 'ai') THEN 'human' ELSE status END,
            handoff_reason = COALESCE(handoff_reason, 'customer_request'),
            handed_off_at = COALESCE(handed_off_at, now()),
            assigned_agent_id = COALESCE(assigned_agent_id, $2),
            first_agent_reply_at = COALESCE(first_agent_reply_at, now()),
            first_response_at = COALESCE(first_response_at, now()),
            last_message_at = now(), version = version + 1
      WHERE id = $1`,
    [id, agentId],
  );
}

export async function resolveByAgent(q: Db, id: string, version: number): Promise<boolean> {
  const rows = await q.query(
    `UPDATE conversations SET status = 'resolved', resolved_at = now(), resolved_by = 'agent', version = version + 1
      WHERE id = $1 AND version = $2 AND status IN ('waiting_human', 'human') RETURNING id`,
    [id, version],
  );
  return rows.length > 0;
}

export async function deleteDraftsOf(q: Db, conversationId: string, agentId: string) {
  await q.query(`DELETE FROM messages WHERE conversation_id = $1 AND is_draft AND sender_id = $2`, [conversationId, agentId]);
}

export async function listCanned() {
  return db.query<{ id: string; title: string; body: string; category: string }>(`SELECT id, title, body, category FROM canned_replies ORDER BY category, title`);
}
