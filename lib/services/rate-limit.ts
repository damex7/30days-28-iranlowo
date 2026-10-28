import "server-only";
import { db } from "@/lib/db";
import { RateLimitedError } from "@/lib/services/errors";

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

/**
 * Fixed-window counter in Postgres. One statement does "create the row for
 * this window or add 1 to it" and returns the new count, so two requests
 * arriving at once can't both see "0 so far". This works on serverless
 * because every instance shares the database; an in-memory Map would
 * reset on every cold start and differ per instance.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const rows = await db.query<{ count: number; retry_after: number }>(
    `INSERT INTO rate_limits (key, window_start, count)
     VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count,
               ceil(extract(epoch FROM (window_start + make_interval(secs => $2) - now())))::int AS retry_after`,
    [key, windowSeconds],
  );
  const row = rows[0] ?? { count: limit + 1, retry_after: windowSeconds };
  return { allowed: row.count <= limit, count: row.count, retryAfterSeconds: Math.max(1, row.retry_after) };
}

/** hit() that throws a RateLimitedError with a friendly message. */
export async function enforce(key: string, limit: number, windowSeconds: number, message: string): Promise<void> {
  const result = await hit(key, limit, windowSeconds);
  if (!result.allowed) throw new RateLimitedError(message, result.retryAfterSeconds);
}

/** Old windows are useless; cron clears them. */
export async function purgeOldWindows(): Promise<number> {
  const rows = await db.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days' RETURNING 1`);
  return rows.length;
}
