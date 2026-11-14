ALTER TABLE shop_orders ADD COLUMN internal_order_id TEXT;

UPDATE shop_orders SET internal_order_id = upper(hex(randomblob(16))) WHERE internal_order_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shop_orders_internal_id ON shop_orders (internal_order_id);
