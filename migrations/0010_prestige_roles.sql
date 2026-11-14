-- Adds 30 collectible roles. Existing purchases and prices are preserved.
INSERT INTO shop_roles(id,name,price,description) VALUES
('role-afterburn','AFTERBURN',900,'Prestige collection'),
('role-limewire','LIMEWIRE',1050,'Prestige collection'),
('role-hologram','HOLOGRAM',1200,'Prestige collection'),
('role-redline','REDLINE',1350,'Prestige collection'),
('role-night-owl','NIGHT OWL',1500,'Prestige collection'),
('role-copper-coil','COPPER COIL',1700,'Prestige collection'),
('role-acid-bloom','ACID BLOOM',1900,'Prestige collection'),
('role-frostbite','FROSTBITE',2100,'Prestige collection'),
('role-ultraviolet','ULTRAVIOLET',2300,'Prestige collection'),
('role-ghost-signal','GHOST SIGNAL',2500,'Prestige collection'),
('role-liquid-silver','LIQUID SILVER',2750,'Prestige collection'),
('role-neon-samurai','NEON SAMURAI',3000,'Prestige collection'),
('role-eclipse','ECLIPSE',3300,'Prestige collection'),
('role-royal-mint','ROYAL MINT',3600,'Prestige collection'),
('role-gold-forge','GOLD FORGE',3950,'Prestige collection'),
('role-synthetic-sun','SYNTHETIC SUN',4300,'Prestige collection'),
('role-platinum-ace','PLATINUM ACE',4700,'Prestige collection'),
('role-chromatic-flux','CHROMATIC FLUX',5100,'Prestige collection'),
('role-voidwalker','VOIDWALKER',5550,'Prestige collection'),
('role-diamond-core','DIAMOND CORE',6000,'Prestige collection'),
('role-supernova','SUPERNOVA',6500,'Prestige collection'),
('role-emerald-sigil','EMERALD SIGIL',7000,'Prestige collection'),
('role-arclight','ARCLIGHT',7550,'Prestige collection'),
('role-black-platinum','BLACK PLATINUM',8150,'Prestige collection'),
('role-spectrum-zero','SPECTRUM ZERO',8800,'Prestige collection'),
('role-astral-crown','ASTRAL CROWN',9500,'Prestige collection'),
('role-singularity','SINGULARITY',10300,'Prestige collection'),
('role-golden-era','GOLDEN ERA',11100,'Prestige collection'),
('role-mythic-phoenix','MYTHIC PHOENIX',12000,'Prestige collection'),
('role-omega-relic','OMEGA RELIC',13500,'Prestige collection');

CREATE VIEW role_achievement_eligibility AS
SELECT telegram_id, 'role-collector-5' AS achievement_id
FROM user_roles GROUP BY telegram_id HAVING COUNT(*) >= 5
UNION ALL
SELECT telegram_id, 'role-club-elite'
FROM user_roles JOIN shop_roles ON shop_roles.id = user_roles.role_id
WHERE shop_roles.price >= 5000
GROUP BY telegram_id HAVING COUNT(*) >= 3
UNION ALL
SELECT telegram_id, 'role-magnate'
FROM user_roles WHERE role_id = 'role-omega-relic';

CREATE TRIGGER role_achievement_purchase AFTER INSERT ON user_roles BEGIN
  INSERT OR IGNORE INTO achievement_xp_grants(telegram_id, achievement_id)
  SELECT telegram_id, achievement_id FROM role_achievement_eligibility
  WHERE telegram_id = NEW.telegram_id;
END;

INSERT OR IGNORE INTO achievement_xp_grants(telegram_id, achievement_id)
SELECT telegram_id, achievement_id FROM role_achievement_eligibility;
