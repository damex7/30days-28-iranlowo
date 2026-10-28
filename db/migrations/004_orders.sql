-- 004: a minimal order history, only so the assistant's tools have real data.

CREATE TABLE orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: an order is a financial record; deleting a customer must not
  -- silently remove it. Demo cleanup deletes demo orders explicitly first.
  customer_id             uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- What customers type ("OJX-204813"); unique store-wide.
  order_number            text NOT NULL UNIQUE CHECK (order_number ~ '^OJX-[0-9]{6}$'),
  status                  text NOT NULL CHECK (status IN
                            ('processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned')),
  payment_method          text NOT NULL CHECK (payment_method IN ('card', 'pay_on_delivery')),
  -- Money is integer kobo in a bigint: floats cannot represent 0.1 exactly.
  total_kobo              bigint NOT NULL CHECK (total_kobo >= 0),
  delivery_city           text NOT NULL CHECK (delivery_city IN ('Lagos', 'Abuja', 'Port Harcourt', 'Ibadan')),
  estimated_delivery_date date,
  delivered_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  -- Target for composite foreign keys: lets a child say "this order AND this
  -- customer" so the database can refuse a row that mixes two customers.
  UNIQUE (id, customer_id)
);
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- "My recent orders": the tool and /orders both read newest-first per customer.
CREATE INDEX orders_customer_recent_idx ON orders (customer_id, created_at DESC, id DESC);

CREATE TABLE order_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE: line items are part of the order, never meaningful alone.
  order_id     uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_name text NOT NULL,
  quantity     integer NOT NULL CHECK (quantity > 0),
  unit_kobo    bigint NOT NULL CHECK (unit_kobo >= 0)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
