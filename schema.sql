-- Схема хмарної бази даних Cloudflare D1 для Alexov Shop (Telegram Mini App)
CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT DEFAULT '',
  first_name TEXT DEFAULT 'Rider',
  last_name TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  tokens INTEGER NOT NULL DEFAULT 100,
  jet_peak INTEGER NOT NULL DEFAULT 100,
  profile_frame_id TEXT NOT NULL DEFAULT '',
  profile_frame_color TEXT NOT NULL DEFAULT '',
  roles TEXT NOT NULL DEFAULT 'RIDER',
  tags TEXT NOT NULL DEFAULT 'RIDER',
  xp INTEGER NOT NULL DEFAULT 50,
  level INTEGER NOT NULL DEFAULT 1,
  rewards TEXT NOT NULL DEFAULT '["early-rider"]',
  referred_by TEXT DEFAULT '',
  activity_rewarded_at TEXT DEFAULT '',
  session_active_at TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('maintenance_mode', '0');

CREATE TRIGGER IF NOT EXISTS users_record_jet_peak
  AFTER UPDATE OF tokens ON users
  WHEN MAX(OLD.tokens, NEW.tokens) > NEW.jet_peak
  BEGIN
    UPDATE users SET jet_peak = MAX(OLD.tokens, NEW.tokens)
    WHERE telegram_id = NEW.telegram_id;
  END;

CREATE TABLE IF NOT EXISTS profile_purchases (
    telegram_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('role', 'frame')),
    label TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price > 0),
    created_at TEXT NOT NULL,
    PRIMARY KEY (telegram_id, item_id)
  );

CREATE TRIGGER IF NOT EXISTS profile_purchase_debit
    AFTER INSERT ON profile_purchases
    BEGIN
      UPDATE users SET tokens = tokens - NEW.price WHERE telegram_id = NEW.telegram_id;
      INSERT INTO jet_transactions (telegram_id, amount, reason, created_at)
      VALUES (NEW.telegram_id, -NEW.price, 'JET Shop · ' || NEW.label, NEW.created_at);
    END;

CREATE TABLE IF NOT EXISTS achievement_xp_grants (
    telegram_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    PRIMARY KEY (telegram_id, achievement_id)
  );

CREATE TRIGGER IF NOT EXISTS achievement_xp_credit
    AFTER INSERT ON achievement_xp_grants
    BEGIN
      UPDATE users
      SET xp = xp + 100, level = MAX(level, 1 + (xp + 100) / 100)
      WHERE telegram_id = NEW.telegram_id;
    END;

CREATE TABLE IF NOT EXISTS terms_records (
  subject_type TEXT NOT NULL CHECK (subject_type IN ('telegram', 'browser')),
  subject_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  first_visited_at TEXT NOT NULL,
  terms_accepted INTEGER NOT NULL DEFAULT 0 CHECK (terms_accepted IN (0, 1)),
  accepted_at TEXT,
  accepted_locale TEXT CHECK (accepted_locale IN ('uk', 'en')),
  PRIMARY KEY (subject_type, subject_id, policy_version),
  CHECK (
    (terms_accepted = 0 AND accepted_at IS NULL AND accepted_locale IS NULL)
    OR (terms_accepted = 1 AND accepted_at IS NOT NULL AND accepted_locale IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS shop_order_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_internal_user_id TEXT UNIQUE,
  browser_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shop_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_order_number TEXT UNIQUE,
  legacy_internal_order_id TEXT UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES shop_order_customers(id),
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

CREATE INDEX IF NOT EXISTS shop_orders_customer_history
ON shop_orders (customer_id, created_at DESC);
