import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { listMyOrders } from "@/lib/services/orders";
import { formatDate, formatKobo } from "@/lib/format";

export const metadata: Metadata = { title: "My orders" };

const STATUS: Record<string, string> = {
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl">My orders</h1>
      <p className="mt-1 text-muted">Read-only. To change an order, <Link href="/support">chat with us</Link>.</p>
      <Suspense fallback={<div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading orders">{[1, 2, 3].map((n) => <div key={n} className="skeleton h-28" />)}</div>}>
        <OrderList />
      </Suspense>
    </div>
  );
}

async function OrderList() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/orders");
  if (user.role !== "customer") redirect("/agent");
  const orders = await listMyOrders(user);
  if (orders.length === 0) return <p className="card mt-4 p-5">You haven&rsquo;t placed any orders yet.</p>;
  return (
    <ul className="mt-4 space-y-3">
      {orders.map((o) => (
        <li key={o.id} className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-sans text-lg font-semibold tabular">{o.order_number}</h2>
            <p className="font-semibold">{STATUS[o.status]}</p>
          </div>
          <p className="text-sm text-muted">
            Placed {formatDate(o.created_at)} · {o.delivery_city} · {o.payment_method === "card" ? "Card" : "Pay on delivery"}
            {o.estimated_delivery_date && !["delivered", "cancelled", "returned"].includes(o.status) ? ` · Estimated delivery ${formatDate(o.estimated_delivery_date)}` : ""}
          </p>
          <ul className="mt-2 text-sm">
            {o.items.map((i) => (
              <li key={i.product_name} className="flex justify-between gap-3">
                <span>{i.quantity} × {i.product_name}</span>
                <span className="tabular">{formatKobo(BigInt(i.unit_kobo) * BigInt(i.quantity))}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-sand pt-2 text-right font-semibold tabular">Total {formatKobo(o.total_kobo)}</p>
        </li>
      ))}
    </ul>
  );
}
