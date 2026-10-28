import "server-only";
import { db } from "@/lib/db";
import type { UserRow } from "@/lib/repos/users";

export async function insertSession(tokenHash: string, userId: string, days: number): Promise<void> {
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [tokenHash, userId, days],
  );
}

/**
 * Looks up a live session and slides its expiry forward, at most once an
 * hour, so an active user stays signed in and an idle one expires.
 */
export async function touchSession(tokenHash: string, days: number): Promise<UserRow | null> {
  const rows = await db.query<UserRow>(
    `WITH s AS (
       UPDATE sessions
          SET expires_at = CASE WHEN last_seen_at < now() - interval '1 hour'
                                THEN now() + make_interval(days => $2) ELSE expires_at END,
              last_seen_at = CASE WHEN last_seen_at < now() - interval '1 hour' THEN now() ELSE last_seen_at END
        WHERE token_hash = $1 AND expires_at > now()
        RETURNING user_id
     )
     SELECT u.id, u.email::text, u.display_name, u.role, u.is_active, u.is_demo, u.is_read_only, u.phone, u.created_at::text
       FROM s JOIN users u ON u.id = s.user_id
      WHERE u.is_active`,
    [tokenHash, days],
  );
  return rows[0] ?? null;
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await db.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  await db.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
}
