DROP TRIGGER IF EXISTS jet_farm_credit;

ALTER TABLE users ADD COLUMN jet_hourly_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN jet_tap_units INTEGER NOT NULL DEFAULT 0 CHECK (jet_tap_units >= 0);
ALTER TABLE users ADD COLUMN jet_tap_energy INTEGER NOT NULL DEFAULT 60 CHECK (jet_tap_energy BETWEEN 0 AND 60);
ALTER TABLE users ADD COLUMN jet_tap_refill_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN jet_tap_last_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN jet_tap_exchanged INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER jet_hourly_credit AFTER UPDATE OF jet_hourly_at ON users
WHEN NEW.jet_hourly_at > OLD.jet_hourly_at
BEGIN
  UPDATE users SET tokens = tokens + 50, activity_rewarded_at = datetime(NEW.jet_hourly_at, 'unixepoch')
  WHERE telegram_id = NEW.telegram_id;
  UPDATE transactions SET type = 'activity_reward', description = 'Hourly JET reward'
  WHERE id = (SELECT MAX(id) FROM transactions WHERE telegram_id = NEW.telegram_id);
  INSERT INTO jet_transactions(telegram_id, amount, reason, created_at)
  VALUES (NEW.telegram_id, 50, 'Hourly JET reward', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER jet_tap_exchange_credit AFTER UPDATE OF jet_tap_exchanged ON users
WHEN NEW.jet_tap_exchanged > OLD.jet_tap_exchanged
BEGIN
  UPDATE users SET tokens = tokens + NEW.jet_tap_exchanged - OLD.jet_tap_exchanged
  WHERE telegram_id = NEW.telegram_id;
  UPDATE transactions SET type = 'tap_exchange', description = 'Jetiki exchange'
  WHERE id = (SELECT MAX(id) FROM transactions WHERE telegram_id = NEW.telegram_id);
  INSERT INTO jet_transactions(telegram_id, amount, reason, created_at)
  VALUES (NEW.telegram_id, NEW.jet_tap_exchanged - OLD.jet_tap_exchanged,
    'Jetiki exchange', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
