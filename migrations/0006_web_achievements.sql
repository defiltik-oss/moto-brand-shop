-- Keep historical grants and XP; only new verified events unlock web achievements.
CREATE TABLE web_achievement_events (
 telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
 event TEXT NOT NULL CHECK(event IN ('first-visit','explorer','first-order','collector')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(telegram_id,event)
);
ALTER TABLE shop_orders ADD COLUMN telegram_id TEXT;
CREATE INDEX shop_orders_telegram ON shop_orders(telegram_id);
CREATE TRIGGER web_achievement_grant AFTER INSERT ON web_achievement_events BEGIN
 INSERT OR IGNORE INTO achievement_xp_grants(telegram_id,achievement_id) VALUES(NEW.telegram_id,NEW.event);
END;
CREATE TRIGGER web_role_collector AFTER INSERT ON user_roles BEGIN
 INSERT OR IGNORE INTO web_achievement_events(telegram_id,event) VALUES(NEW.telegram_id,'collector');
END;
CREATE TRIGGER web_first_order AFTER INSERT ON shop_orders WHEN NEW.telegram_id IS NOT NULL BEGIN
 INSERT OR IGNORE INTO web_achievement_events(telegram_id,event)
 SELECT telegram_id,'first-order' FROM users WHERE telegram_id=NEW.telegram_id;
END;
INSERT OR IGNORE INTO web_achievement_events(telegram_id,event)
 SELECT DISTINCT telegram_id,'collector' FROM user_roles;
