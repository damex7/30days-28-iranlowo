import "server-only";
import { withTransaction } from "@/lib/db";
import type { Actor } from "@/lib/auth/session";
import { recordAudit } from "@/lib/repos/audit";
import { deleteSessionsForUser } from "@/lib/repos/sessions";
import { findUserForSignIn, listStaff, setActive, setRole } from "@/lib/repos/users";
import { requireAdmin } from "@/lib/services/permissions";
import { NotFoundError, RuleError } from "@/lib/services/errors";
import { listCronRuns, runDailyMaintenance } from "@/lib/services/cron";

export async function staffOverview(actor: Actor | null) {
  requireAdmin(actor);
  const [staff, cron] = await Promise.all([listStaff(), listCronRuns()]);
  return { staff, cron };
}

/** Promote an existing customer account to agent. */
export async function promoteToAgent(actor: Actor | null, email: string) {
  const admin = requireAdmin(actor);
  const user = await findUserForSignIn(email);
  if (!user || user.is_demo) throw new NotFoundError("No account with that email.");
  if (user.role !== "customer") throw new RuleError(`${user.display_name} is already ${user.role === "admin" ? "an admin" : "an agent"}.`);
  await withTransaction(async (tx) => {
    await setRole(user.id, "agent", tx);
    await recordAudit(tx, admin.id, "user.promote_agent", "user", user.id, {});
  });
}

/**
 * Deactivate (or reactivate) an agent. Deactivated agents can't sign in and
 * their sessions end immediately; their past replies keep their name.
 */
export async function setAgentActive(actor: Actor | null, userId: string, active: boolean) {
  const admin = requireAdmin(actor);
  if (userId === admin.id) throw new RuleError("You can't deactivate yourself.");
  const staff = await listStaff();
  const target = staff.find((s) => s.id === userId);
  if (!target || target.role !== "agent") throw new NotFoundError();
  await withTransaction(async (tx) => {
    await setActive(userId, active, tx);
    // Open cases go back to the queue so no customer waits on someone who left.
    if (!active) {
      await tx.query(`UPDATE conversations SET assigned_agent_id = NULL, status = 'waiting_human' WHERE assigned_agent_id = $1 AND status = 'human'`, [userId]);
    }
    await recordAudit(tx, admin.id, active ? "user.reactivate" : "user.deactivate", "user", userId, {});
  });
  if (!active) await deleteSessionsForUser(userId);
}

export async function runCronNow(actor: Actor | null) {
  requireAdmin(actor);
  return runDailyMaintenance("manual");
}
