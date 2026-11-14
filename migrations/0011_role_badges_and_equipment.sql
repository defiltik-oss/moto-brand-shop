-- Apply after 0009_role_collection and 0010_prestige_roles (30 new roles).
ALTER TABLE shop_roles ADD COLUMN icon TEXT NOT NULL DEFAULT '✦';
ALTER TABLE shop_roles ADD COLUMN badge_start TEXT NOT NULL DEFAULT '#2e4364';
ALTER TABLE shop_roles ADD COLUMN badge_end TEXT NOT NULL DEFAULT '#4f3468';
ALTER TABLE shop_roles ADD COLUMN badge_mid TEXT;
ALTER TABLE shop_roles ADD COLUMN rarity TEXT NOT NULL DEFAULT 'rare'
  CHECK (rarity IN ('rare', 'epic', 'legendary', 'mythic', 'divine'));

ALTER TABLE users ADD COLUMN active_role_id TEXT REFERENCES shop_roles(id);
CREATE TRIGGER active_role_requires_ownership BEFORE UPDATE OF active_role_id ON users
WHEN NEW.active_role_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM user_roles WHERE telegram_id = NEW.telegram_id AND role_id = NEW.active_role_id
)
BEGIN
  SELECT RAISE(ABORT, 'role-not-owned');
END;

UPDATE shop_roles SET icon='◆', badge_start='#245764', badge_end='#20283e' WHERE id='role-street';
UPDATE shop_roles SET icon='◆', badge_start='#33572a', badge_end='#20283e' WHERE id='role-spark';
UPDATE shop_roles SET icon='◆', badge_start='#2b536d', badge_end='#20283e' WHERE id='role-cruise';
UPDATE shop_roles SET icon='◆', badge_start='#3d5268', badge_end='#20283e' WHERE id='role-voltage';
UPDATE shop_roles SET icon='◆', badge_start='#39306b', badge_end='#20283e' WHERE id='role-night';
UPDATE shop_roles SET icon='◆', badge_start='#693d22', badge_end='#20283e' WHERE id='role-elite';
UPDATE shop_roles SET icon='◆', badge_start='#264b7e', badge_end='#20283e' WHERE id='role-storm';
UPDATE shop_roles SET icon='◆', badge_start='#415876', badge_end='#20283e' WHERE id='role-titan';
UPDATE shop_roles SET icon='◆', badge_start='#784d18', badge_end='#20283e' WHERE id='role-legend';
UPDATE shop_roles SET icon='◆', badge_start='#642b72', badge_end='#20283e' WHERE id='role-exclusive';


UPDATE shop_roles SET icon='🔥', badge_start='#611c26', badge_end='#a33a22' WHERE id='role-afterburn';
UPDATE shop_roles SET icon='⚡', badge_start='#295118', badge_end='#44701b' WHERE id='role-limewire';
UPDATE shop_roles SET icon='🫧', badge_start='#15566b', badge_end='#4f348a' WHERE id='role-hologram';
UPDATE shop_roles SET icon='🏁', badge_start='#821f37', badge_end='#411726' WHERE id='role-redline';
UPDATE shop_roles SET icon='🦉', badge_start='#282453', badge_end='#454568' WHERE id='role-night-owl';
UPDATE shop_roles SET icon='🧲', badge_start='#62371d', badge_end='#98532b' WHERE id='role-copper-coil';
UPDATE shop_roles SET icon='☣', badge_start='#345118', badge_end='#64740b' WHERE id='role-acid-bloom';
UPDATE shop_roles SET icon='❄', badge_start='#23486c', badge_end='#2d6576' WHERE id='role-frostbite';
UPDATE shop_roles SET icon='☀', badge_start='#461d79', badge_end='#712c92' WHERE id='role-ultraviolet';
UPDATE shop_roles SET icon='📡', badge_start='#314457', badge_end='#4b596b' WHERE id='role-ghost-signal';
UPDATE shop_roles SET icon='🌙', badge_start='#3d4b60', badge_end='#58687c' WHERE id='role-liquid-silver';
UPDATE shop_roles SET icon='⚔', badge_start='#650e5c', badge_end='#23467c' WHERE id='role-neon-samurai';
UPDATE shop_roles SET icon='🌑', badge_start='#292136', badge_end='#743827' WHERE id='role-eclipse';
UPDATE shop_roles SET icon='🍃', badge_start='#155943', badge_end='#1d7264' WHERE id='role-royal-mint';
UPDATE shop_roles SET icon='⚒', badge_start='#633415', badge_end='#94640f' WHERE id='role-gold-forge';
UPDATE shop_roles SET icon='✹', badge_start='#5d2616', badge_end='#a3580c' WHERE id='role-synthetic-sun';
UPDATE shop_roles SET icon='♠', badge_start='#364b63', badge_end='#617280' WHERE id='role-platinum-ace';
UPDATE shop_roles SET icon='🌈', badge_start='#852252', badge_end='#12685b', badge_mid='#5441a0' WHERE id='role-chromatic-flux';
UPDATE shop_roles SET icon='🕳', badge_start='#201734', badge_end='#473067' WHERE id='role-voidwalker';
UPDATE shop_roles SET icon='💎', badge_start='#285475', badge_end='#22576b' WHERE id='role-diamond-core';
UPDATE shop_roles SET icon='✺', badge_start='#77264b', badge_end='#965025' WHERE id='role-supernova';
UPDATE shop_roles SET icon='❖', badge_start='#154735', badge_end='#20744a' WHERE id='role-emerald-sigil';
UPDATE shop_roles SET icon='🔦', badge_start='#174f6e', badge_end='#5649a0' WHERE id='role-arclight';
UPDATE shop_roles SET icon='♜', badge_start='#151d28', badge_end='#475e68' WHERE id='role-black-platinum';
UPDATE shop_roles SET icon='🔺', badge_start='#613097', badge_end='#176b73', badge_mid='#8e274d' WHERE id='role-spectrum-zero';
UPDATE shop_roles SET icon='👑', badge_start='#442f7d', badge_end='#885d1f' WHERE id='role-astral-crown';
UPDATE shop_roles SET icon='◉', badge_start='#242142', badge_end='#583c82', price=17500 WHERE id='role-singularity';
UPDATE shop_roles SET icon='🏆', badge_start='#643814', badge_end='#946511', price=21000 WHERE id='role-golden-era';
UPDATE shop_roles SET icon='🪦', badge_start='#81263a', badge_end='#9c5516', price=32000 WHERE id='role-mythic-phoenix';
UPDATE shop_roles SET icon='Ω', badge_start='#4a2681', badge_end='#125e75', badge_mid='#85335f', price=50000 WHERE id='role-omega-relic';
UPDATE shop_roles SET icon='☣', badge_start='#26344d', badge_end='#573862' WHERE id='role-urban';
UPDATE shop_roles SET icon='☤', badge_start='#26344d', badge_end='#573862' WHERE id='role-commuter';
UPDATE shop_roles SET icon='☥', badge_start='#26344d', badge_end='#573862' WHERE id='role-pulse';
UPDATE shop_roles SET icon='☦', badge_start='#26344d', badge_end='#573862' WHERE id='role-neon';
UPDATE shop_roles SET icon='☧', badge_start='#26344d', badge_end='#573862' WHERE id='role-circuit';
UPDATE shop_roles SET icon='☨', badge_start='#26344d', badge_end='#573862' WHERE id='role-drift';
UPDATE shop_roles SET icon='☩', badge_start='#26344d', badge_end='#573862' WHERE id='role-horizon';
UPDATE shop_roles SET icon='☪', badge_start='#26344d', badge_end='#573862' WHERE id='role-nomad';
UPDATE shop_roles SET icon='☫', badge_start='#26344d', badge_end='#573862' WHERE id='role-phantom';
UPDATE shop_roles SET icon='☬', badge_start='#334155', badge_end='#64748b' WHERE id='role-chrome';
UPDATE shop_roles SET icon='☭', badge_start='#334155', badge_end='#64748b' WHERE id='role-silver';
UPDATE shop_roles SET icon='☮', badge_start='#713f12', badge_end='#a16207' WHERE id='role-gold';
UPDATE shop_roles SET icon='☯', badge_start='#334155', badge_end='#64748b' WHERE id='role-platinum';
UPDATE shop_roles SET icon='☰', badge_start='#4338ca', badge_end='#0369a1', badge_mid='#a21caf' WHERE id='role-prism';
UPDATE shop_roles SET icon='☱', badge_start='#4338ca', badge_end='#0369a1', badge_mid='#a21caf' WHERE id='role-aurora';
UPDATE shop_roles SET icon='☲', badge_start='#4338ca', badge_end='#0369a1', badge_mid='#a21caf' WHERE id='role-spectrum';
UPDATE shop_roles SET icon='☳', badge_start='#4338ca', badge_end='#0369a1', badge_mid='#a21caf' WHERE id='role-rgb';
UPDATE shop_roles SET icon='☴', badge_start='#4338ca', badge_end='#0369a1', badge_mid='#a21caf' WHERE id='role-diamond';
UPDATE shop_roles SET icon='☵', badge_start='#4338ca', badge_end='#0369a1', badge_mid='#a21caf' WHERE id='role-cosmic';
UPDATE shop_roles SET icon='☶', badge_start='#4338ca', badge_end='#0369a1', badge_mid='#a21caf' WHERE id='role-sovereign';

UPDATE shop_roles SET rarity = CASE
  WHEN price >= 40000 THEN 'divine'
  WHEN price >= 10000 THEN 'mythic'
  WHEN price >= 5000 THEN 'legendary'
  WHEN price >= 2500 THEN 'epic'
  ELSE 'rare'
END;
