import "server-only";
import { db } from "@/lib/db";

export type OrderRow = {
  id: string;
  order_number: string;
  status: "processing" | "shipped" | "out_for_delivery" | "delivered" | "cancelled" | "returned";
  payment_method: "card" | "pay_on_delivery";
  total_kobo: string;
  delivery_city: string;
  estimated_delivery_date: string | null;
  created_at: string;
  items: { product_name: string; quantity: number; unit_kobo: string }[];
};

// Every query here filters by customer_id. There is deliberately no
// "find order by number" without a customer: ownership is part of the key.
const SELECT = `
  SELECT o.id, o.order_number, o.status, o.payment_method, o.total_kobo::text, o.delivery_city,
         o.estimated_delivery_date::text, o.created_at::text,
         COALESCE((SELECT json_agg(json_build_object('product_name', i.product_name, 'quantity', i.quantity, 'unit_kobo', i.unit_kobo::text) ORDER BY i.product_name)
                     FROM order_items i WHERE i.order_id = o.id), '[]'::json) AS items
    FROM orders o`;

export async function findOrderForCustomer(customerId: string, orderNumber: string): Promise<OrderRow | null> {
  const rows = await db.query<OrderRow>(`${SELECT} WHERE o.customer_id = $1 AND o.order_number = $2`, [customerId, orderNumber]);
  return rows[0] ?? null;
}

export async function listOrdersForCustomer(customerId: string, limit: number): Promise<OrderRow[]> {
  return db.query<OrderRow>(`${SELECT} WHERE o.customer_id = $1 ORDER BY o.created_at DESC, o.id DESC LIMIT $2`, [customerId, limit]);
}
