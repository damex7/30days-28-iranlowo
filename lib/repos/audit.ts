import "server-only";
import { db, type Db } from "@/lib/db";

export async function recordAudit(q: Db, actorId: string | null, action: string, targetType: string, targetId: string, detail: Record<string, unknown> = {}) {
  await q.query(`INSERT INTO audit_events (actor_id, action, target_type, target_id, detail) VALUES ($1, $2, $3, $4, $5)`, [
    actorId,
    action,
    targetType,
    targetId,
    detail,
  ]);
}

export async function listAuditFor(targetType: string, targetId: string) {
  return db.query<{ id: number; action: string; actor_name: string | null; created_at: string; detail: Record<string, unknown> }>(
    `SELECT e.id::int, e.action, u.display_name AS actor_name, e.created_at::text, e.detail
       FROM audit_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.target_type = $1 AND e.target_id = $2
      ORDER BY e.created_at DESC LIMIT 20`,
    [targetType, targetId],
  );
}
