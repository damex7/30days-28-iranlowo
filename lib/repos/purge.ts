import "server-only";
import { withTransaction } from "@/lib/db";

/**
 * Deletes demo users and everything they own, children first, in one
 * transaction. This is the ONLY path that deletes conversations or
 * messages: messages are append-only, so the transaction sets
 * app.allow_purge (SET LOCAL semantics) to get past that trigger, and the
 * flag disappears at COMMIT. Refuses to touch non-demo users.
 */
export async function purgeDemoUsers(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  return withTransaction(async (tx) => {
    const demo = await tx.query<{ id: string }>(`SELECT id FROM users WHERE id = ANY($1::uuid[]) AND is_demo`, [userIds]);
    const ids = demo.map((d) => d.id);
    if (ids.length === 0) return 0;
    await tx.query(`SELECT set_config('app.allow_purge', 'on', true)`);
    await tx.query(`DELETE FROM message_feedback WHERE customer_id = ANY($1::uuid[]) OR user_id = ANY($1::uuid[])`, [ids]);
    await tx.query(`DELETE FROM ai_runs WHERE conversation_id IN (SELECT id FROM conversations WHERE customer_id = ANY($1::uuid[]))`, [ids]);
    await tx.query(`DELETE FROM messages WHERE customer_id = ANY($1::uuid[])`, [ids]);
    await tx.query(`DELETE FROM conversations WHERE customer_id = ANY($1::uuid[])`, [ids]);
    await tx.query(`DELETE FROM orders WHERE customer_id = ANY($1::uuid[])`, [ids]); // order_items cascade
    await tx.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]); // sessions cascade
    return ids.length;
  });
}
