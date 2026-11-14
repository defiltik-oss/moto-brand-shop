-- Keep existing JET economy: balance is a read-only alias, never a second wallet.
ALTER TABLE users ADD COLUMN balance INTEGER GENERATED ALWAYS AS (tokens) VIRTUAL;
CREATE TABLE shop_roles (id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price > 0), description TEXT NOT NULL);
CREATE TABLE user_roles (telegram_id TEXT NOT NULL REFERENCES users(telegram_id), role_id TEXT NOT NULL REFERENCES shop_roles(id), purchased_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(telegram_id, role_id));
CREATE TABLE transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT NOT NULL REFERENCES users(telegram_id), amount INTEGER NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX transactions_user_date ON transactions(telegram_id, id DESC);
INSERT INTO shop_roles VALUES
('role-street','STREET RIDER',50,'Street collection'),
('role-spark','SPARK',100,'Electric collection'),
('role-cruise','CRUISER',150,'City collection'),
('role-voltage','VOLTAGE RIDER',250,'Electric collection'),
('role-night','NIGHT SHIFT',450,'Night collection'),
('role-elite','ELITE',700,'Elite collection'),
('role-storm','STORM',1000,'Storm collection'),
('role-titan','TITAN',1500,'Titan collection'),
('role-legend','LEGEND',2500,'Legend collection'),
('role-exclusive','APEX',5000,'Exclusive collection');
-- Historical purchases remain owned, without charging again.
INSERT OR IGNORE INTO shop_roles SELECT item_id, label, price, 'Legacy collection' FROM profile_purchases WHERE kind='role';
INSERT OR IGNORE INTO user_roles SELECT telegram_id,item_id,created_at FROM profile_purchases WHERE kind='role';
INSERT INTO transactions(telegram_id,amount,type,description,created_at) SELECT telegram_id,amount,'legacy',reason,created_at FROM jet_transactions WHERE telegram_id IN (SELECT telegram_id FROM users);
-- Reconcile older balances even where the legacy journal was incomplete.
INSERT INTO transactions(telegram_id,amount,type,description)
SELECT u.telegram_id,u.tokens-COALESCE(SUM(t.amount),0),'opening_balance','Migrated JET balance'
FROM users u LEFT JOIN transactions t ON t.telegram_id=u.telegram_id GROUP BY u.telegram_id
HAVING u.tokens-COALESCE(SUM(t.amount),0) != 0;
CREATE TRIGGER economy_new_user AFTER INSERT ON users WHEN NEW.tokens != 0 BEGIN
 INSERT INTO transactions(telegram_id,amount,type,description) VALUES(NEW.telegram_id,NEW.tokens,'opening_balance','Initial JET balance');
END;
CREATE TRIGGER economy_ledger AFTER UPDATE OF tokens ON users WHEN NEW.tokens != OLD.tokens BEGIN
 INSERT INTO transactions(telegram_id,amount,type,description) VALUES(NEW.telegram_id,NEW.tokens-OLD.tokens,'balance_change','JET balance adjustment');
END;
CREATE TRIGGER role_purchase_guard BEFORE INSERT ON user_roles BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM shop_roles WHERE id=NEW.role_id) THEN RAISE(ABORT,'role-not-found') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users u JOIN shop_roles r ON r.id=NEW.role_id WHERE u.telegram_id=NEW.telegram_id AND u.tokens>=r.price) THEN RAISE(ABORT,'insufficient-funds') END;
END;
CREATE TRIGGER role_purchase_debit AFTER INSERT ON user_roles BEGIN
 UPDATE users SET tokens=tokens-(SELECT price FROM shop_roles WHERE id=NEW.role_id) WHERE telegram_id=NEW.telegram_id;
 UPDATE transactions SET type='purchase_role', description=(SELECT name FROM shop_roles WHERE id=NEW.role_id) WHERE id=(SELECT MAX(id) FROM transactions WHERE telegram_id=NEW.telegram_id);
 INSERT INTO jet_transactions(telegram_id,amount,reason,created_at) SELECT NEW.telegram_id,-price,'Role: '||name,NEW.purchased_at FROM shop_roles WHERE id=NEW.role_id;
END;
