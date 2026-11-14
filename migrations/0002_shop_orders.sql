CREATE TABLE IF NOT EXISTS shop_order_customers (
  internal_user_id TEXT PRIMARY KEY NOT NULL,
  browser_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_orders (
  order_number TEXT PRIMARY KEY NOT NULL,
  internal_user_id TEXT NOT NULL REFERENCES shop_order_customers(internal_user_id),
  submission_key TEXT NOT NULL,
  provided_username TEXT,
  order_details TEXT NOT NULL,
  receipt_data BLOB,
  receipt_metadata TEXT,
  created_at TEXT NOT NULL,
  ip_hash TEXT,
  previous_orders INTEGER NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'message_only', 'failed')),
  telegram_message_id INTEGER,
  telegram_chat_id TEXT,
  telegram_file_id TEXT,
  UNIQUE (internal_user_id, submission_key)
);

CREATE INDEX IF NOT EXISTS shop_orders_customer_history
ON shop_orders (internal_user_id, created_at DESC);
