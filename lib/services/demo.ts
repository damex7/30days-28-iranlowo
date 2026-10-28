import "server-only";
import { randomBytes } from "node:crypto";
import { db, withTransaction } from "@/lib/db";
import { startSession, type Actor } from "@/lib/auth/session";
import { insertUser, findUserForSignIn } from "@/lib/repos/users";
import { enforce } from "@/lib/services/rate-limit";

// DEMO MODE. No passwords: a POST button creates (or reuses) a demo account
// and signs you in. Demo emails use example.com (a reserved domain that
// accepts the format but never delivers), not ".invalid", so they pass the
// same email validation as real ones. Everything a demo customer creates is
// deleted by the daily cron after 24 hours.

const LIMIT_MESSAGE = "Too many demo sessions from this network. Try again in an hour.";

/** "Try as a customer": an isolated customer with three orders (one delayed, one delivered). */
export async function startDemoCustomer(actor: Actor | null, ip: string): Promise<void> {
  void actor;
  await enforce(`demo:ip:${ip}`, 8, 3600, LIMIT_MESSAGE);
  const tag = randomBytes(4).toString("hex");
  const user = await withTransaction(async (tx) => {
    const u = await insertUser({ email: `demo+${tag}@example.com`, displayName: "Demo Customer", passwordHash: null, isDemo: true, phone: "0800 000 0000" }, tx);
    if (!u) throw new Error("demo user clash");
    const n = Number.parseInt(tag.slice(0, 5), 16) % 100000;
    const orders: [string, string, string, number, number | null, string, number, number][] = [
      // number, status, pay, total kobo, eta offset (days), product, qty, days ago
      [`OJX-7${String(n).padStart(5, "0")}`, "shipped", "card", 41200000, -3, "LG 43\" smart TV", 1, 8],
      [`OJX-8${String(n).padStart(5, "0")}`, "delivered", "pay_on_delivery", 1850000, -2, "Binatone 1.7L kettle", 1, 5],
      [`OJX-6${String(n).padStart(5, "0")}`, "processing", "pay_on_delivery", 4300000, 2, "Mama Gold rice 10kg", 2, 0],
    ];
    for (const [number, status, pay, total, eta, product, qty, ago] of orders) {
      const [o] = await tx.query<{ id: string }>(
        `INSERT INTO orders (customer_id, order_number, status, payment_method, total_kobo, delivery_city, estimated_delivery_date, created_at, delivered_at)
         VALUES ($1, $2, $3, $4, $5::bigint, 'Lagos', (now() AT TIME ZONE 'Africa/Lagos')::date + $6::int, now() - make_interval(days => $7::int),
                 CASE WHEN $3 = 'delivered' THEN now() - interval '2 days' END)
         ON CONFLICT (order_number) DO NOTHING RETURNING id`,
        [u.id, number, status, pay, String(total), eta, ago],
      );
      if (o) await tx.query(`INSERT INTO order_items (order_id, product_name, quantity, unit_kobo) VALUES ($1, $2, $3, $4::bigint)`, [o.id, product, qty, String(total / qty)]);
    }
    return u;
  });
  await startSession(user.id);
}

/** "Look around as an agent": one shared, read-only demo agent. */
export async function startDemoAgent(actor: Actor | null, ip: string): Promise<void> {
  void actor;
  await enforce(`demo:ip:${ip}`, 8, 3600, LIMIT_MESSAGE);
  const email = "demo+agent@example.com";
  let agent = await findUserForSignIn(email);
  if (!agent) {
    await insertUser({ email, displayName: "Demo Agent", passwordHash: null, role: "agent", isDemo: true, isReadOnly: true });
    agent = await findUserForSignIn(email);
  }
  if (!agent) throw new Error("demo agent unavailable");
  // Make sure it stays read-only even if someone edited the row.
  await db.query(`UPDATE users SET is_read_only = true, role = 'agent', is_active = true WHERE id = $1`, [agent.id]);
  await startSession(agent.id);
}
