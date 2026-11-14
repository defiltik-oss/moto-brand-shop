-- Preserve the identifiers shown in old Telegram notifications.
CREATE TABLE shop_order_customers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_internal_user_id TEXT UNIQUE,
  browser_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

INSERT INTO shop_order_customers_new (legacy_internal_user_id, browser_key, created_at)
SELECT internal_user_id, browser_key, created_at
FROM shop_order_customers ORDER BY created_at, internal_user_id;

CREATE TABLE shop_orders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_order_number TEXT UNIQUE,
  legacy_internal_order_id TEXT UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES shop_order_customers_new(id),
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
  UNIQUE (customer_id, submission_key)
);

INSERT INTO shop_orders_new (
  legacy_order_number, legacy_internal_order_id, customer_id, submission_key,
  provided_username, order_details, receipt_data, receipt_metadata, created_at, ip_hash,
  previous_orders, delivery_status, telegram_message_id, telegram_chat_id, telegram_file_id
)
SELECT old.order_number, old.internal_order_id, customer.id, old.submission_key,
  old.provided_username, old.order_details, old.receipt_data, old.receipt_metadata,
  old.created_at, old.ip_hash, old.previous_orders, old.delivery_status,
  old.telegram_message_id, old.telegram_chat_id, old.telegram_file_id
FROM shop_orders AS old
LEFT JOIN shop_order_customers_new AS customer ON customer.legacy_internal_user_id = old.internal_user_id
ORDER BY old.created_at, old.order_number;

DROP TABLE shop_orders;
DROP TABLE shop_order_customers;
ALTER TABLE shop_order_customers_new RENAME TO shop_order_customers;
ALTER TABLE shop_orders_new RENAME TO shop_orders;

CREATE INDEX IF NOT EXISTS shop_orders_customer_history
ON shop_orders (customer_id, created_at DESC);
