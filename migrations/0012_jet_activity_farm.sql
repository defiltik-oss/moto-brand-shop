ALTER TABLE users ADD COLUMN jet_farm_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN jet_farm_last_seen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN jet_farm_session TEXT;

-- Running in the same statement as the heartbeat keeps the balance and
-- both transaction views consistent, including concurrent requests.
CREATE TRIGGER jet_farm_credit AFTER UPDATE OF jet_farm_seconds ON users
WHEN NEW.jet_farm_seconds / 300 > OLD.jet_farm_seconds / 300
BEGIN
  UPDATE users SET tokens = tokens + 10 WHERE telegram_id = NEW.telegram_id;
  UPDATE transactions SET type = 'activity_reward', description = 'JET activity reward'
  WHERE id = (SELECT MAX(id) FROM transactions WHERE telegram_id = NEW.telegram_id);
  INSERT INTO jet_transactions(telegram_id, amount, reason, created_at)
  VALUES (NEW.telegram_id, 10, 'JET activity reward', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
