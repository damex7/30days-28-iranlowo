import "server-only";
import type { Actor } from "@/lib/auth/session";
import { listOrdersForCustomer } from "@/lib/repos/orders";
import { requireCustomer } from "@/lib/services/permissions";

/** /orders: the signed-in customer's own orders, newest first. */
export async function listMyOrders(actor: Actor | null) {
  const customer = requireCustomer(actor);
  return listOrdersForCustomer(customer.id, 50);
}
