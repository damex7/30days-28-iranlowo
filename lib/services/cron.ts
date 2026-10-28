import "server-only";
import { db } from "@/lib/db";
import { purgeDemoUsers } from "@/lib/repos/purge";
import { sendCsatRequest } from "@/lib/services/notifications";
import { purgeOldWindows } from "@/lib/services/rate-limit";

// Daily housekeeping. Runs from Vercel Cron (/api/cron/daily) and also
// lazily when an agent or admin page loads and no run happened in the
// last 24 hours, so a missed cron (or a deploy without cron) still gets it
// done. Every step is idempotent: it changes only rows that still need
// it ("closed_at IS NULL", "csat_requested_at IS NULL"...), so running it
// twice, or two runs overlapping, does no harm.

export type CronResults = {
  autoClosed: number;
  csatRequested: number;
  staleFlagged: number;
  demoUsersDeleted: number;
  rateLimitRowsDeleted: number;
  sessionsDeleted: number;
};

export async function runDailyMaintenance(trigger: "cron" | "lazy" | "manual", runId?: number): Promise<CronResults> {
  const id =
    runId ?? (await db.query<{ id: number }>(`INSERT INTO cron_runs (trigger) VALUES ($1) RETURNING id::int`, [trigger]))[0]!.id;
  try {
    // 1. Resolved more than 3 days ago -> closed.
    const closed = await db.query(
      `UPDATE conversations SET status = 'closed', closed_at = now(), version = version + 1
        WHERE status = 'resolved' AND resolved_at < now() - interval '3 days' RETURNING id`,
    );

    // 2. One CSAT email per resolved conversation: claim it (set the
    // timestamp) and send in the same step; a claimed row is never sent again.
    const csat = await db.query<{ id: string; subject: string; email: string; display_name: string }>(
      `UPDATE conversations c SET csat_requested_at = now()
         FROM users u
        WHERE u.id = c.customer_id AND NOT u.is_demo
          AND c.status IN ('resolved', 'closed') AND c.csat_requested_at IS NULL AND c.csat_rating IS NULL
          AND c.resolved_at > now() - interval '14 days'
        RETURNING c.id, c.subject, u.email::text, u.display_name`,
    );
    for (const c of csat) await sendCsatRequest({ email: c.email, name: c.display_name, conversationId: c.id, subject: c.subject });

    // 3. Waiting for a person for over an hour: flag once for the inbox.
    const stale = await db.query(
      `UPDATE conversations SET stale_flagged_at = now()
        WHERE status = 'waiting_human' AND handed_off_at < now() - interval '1 hour' AND stale_flagged_at IS NULL RETURNING id`,
    );

    // 4. Demo data older than 24 hours: the only data the cron deletes.
    const demo = await db.query<{ id: string }>(`SELECT id FROM users WHERE is_demo AND created_at < now() - interval '24 hours'`);
    const demoUsersDeleted = await purgeDemoUsers(demo.map((d) => d.id));

    // 5. Leftovers that are useless now.
    const rateLimitRowsDeleted = await purgeOldWindows();
    const sessions = await db.query(`DELETE FROM sessions WHERE expires_at < now() RETURNING 1`);

    const results: CronResults = {
      autoClosed: closed.length,
      csatRequested: csat.length,
      staleFlagged: stale.length,
      demoUsersDeleted,
      rateLimitRowsDeleted,
      sessionsDeleted: sessions.length,
    };
    await db.query(`UPDATE cron_runs SET finished_at = now(), results = $2 WHERE id = $1`, [id, results]);
    return results;
  } catch (error) {
    await db.query(`UPDATE cron_runs SET finished_at = now(), error = $2 WHERE id = $1`, [id, error instanceof Error ? error.message.slice(0, 500) : "failed"]);
    throw error;
  }
}

/**
 * Starts a lazy run only if none started in the last 24 hours. The INSERT
 * ... WHERE NOT EXISTS claims the run in one statement, so most concurrent
 * page loads see the claim and skip.
 */
export async function runLazyMaintenance(): Promise<CronResults | null> {
  const claimed = await db.query<{ id: number }>(
    `INSERT INTO cron_runs (trigger)
     SELECT 'lazy' WHERE NOT EXISTS (SELECT 1 FROM cron_runs WHERE started_at > now() - interval '24 hours')
     RETURNING id::int`,
  );
  const run = claimed[0];
  return run ? runDailyMaintenance("lazy", run.id) : null;
}

export async function listCronRuns() {
  return db.query<{ id: number; trigger: string; started_at: string; finished_at: string | null; results: Partial<CronResults>; error: string | null }>(
    `SELECT id::int, trigger, started_at::text, finished_at::text, results, error FROM cron_runs ORDER BY started_at DESC LIMIT 30`,
  );
}
