import { subscriberCount } from './subscriber-cache.mjs';
/**
 * Cloudflare Pages Worker (_worker.js) для Alexov Shop (Telegram Mini App)
 *
 * Повноцінна хмарна база даних Cloudflare D1 (таблиця `users`):
 * - telegram_id (TEXT PRIMARY KEY)
 * - username (TEXT)
 * - first_name (TEXT)
 * - last_name (TEXT)
 * - photo_url (TEXT)
 * - tokens (INTEGER, стартовий баланс 100 JET — зберігається виключно на сервері)
 * - roles (TEXT — ролі та теги в стилі Discord)
 * - tags (TEXT — синхронне поле ролей/тегів)
 * - xp (INTEGER)
 * - level (INTEGER)
 * - rewards (TEXT — JSON-масив ID виданих ачівок)
 * - created_at (TEXT — точна дата і час першого входу / реєстрації)
 * - last_login_at (TEXT — час останнього входу)
 *
 * Серверний контроль і безпека:
 * - Усі зміни балансу (tokens), ролей (roles/tags), рівня (level/xp) та ачівок (rewards)
 *   відбуваються суворо на боці бекенду (Cloudflare Worker + D1), виключаючи будь-які
 *   маніпуляції через клієнтський код або консоль браузера.
 * - Адміністратор (ID: 5905168657) керує даними користувачів через захищені серверні
 *   команди Telegram-бота (/users, /user, /setjet, /addjet, /setrole, /setlvl, /give, /maintenance)
 *   або захищені серверні запити /api/admin/* із криптографічною перевіркою.
 */

const ORDERS_GROUP_ID = '-1004321813879';
const ADMIN_TELEGRAM_ID = '5905168657';

const TENURE_REWARDS = [
  ['tenure-1d', 1], ['tenure-7d', 7], ['tenure-14d', 14], ['tenure-1m', 30],
  ['tenure-3m', 90], ['tenure-6m', 180], ['tenure-1y', 365],
];
const JET_REWARDS = [
  ['jet-rookie', 100], ['jet-saver', 150], ['jet-magnate', 500], ['jet-whale-1000', 1000],
];

TENURE_REWARDS.push(...[["tenure-extra-2",2],["tenure-extra-3",3],["tenure-extra-5",5],["tenure-extra-10",10],["tenure-extra-21",21],["tenure-extra-45",45],["tenure-extra-60",60],["tenure-extra-120",120],["tenure-extra-150",150],["tenure-extra-210",210],["tenure-extra-240",240],["tenure-extra-270",270],["tenure-extra-300",300],["tenure-extra-400",400],["tenure-extra-500",500],["tenure-extra-600",600],["tenure-extra-730",730]]);
JET_REWARDS.push(...[["jet-extra-200",200],["jet-extra-250",250],["jet-extra-300",300],["jet-extra-400",400],["jet-extra-600",600],["jet-extra-750",750],["jet-extra-900",900],["jet-extra-1250",1250],["jet-extra-1500",1500],["jet-extra-2000",2000],["jet-extra-2500",2500],["jet-extra-3000",3000],["jet-extra-4000",4000],["jet-extra-5000",5000],["jet-extra-7500",7500],["jet-extra-10000",10000],["jet-extra-20000",20000]]);
const ALL_ACHIEVEMENT_IDS = ['first-visit','explorer','first-order','collector','founder-50', ...TENURE_REWARDS.map(([id])=>id), ...JET_REWARDS.map(([id])=>id)];

const PROFILE_SHOP_ITEMS = [
  {
    id: "role-voltage",
    kind: "role",
    label: "VOLTAGE RIDER",
    price: 250
  },
  {
    id: "role-night",
    kind: "role",
    label: "NIGHT SHIFT",
    price: 450
  },
  {
    id: "frame-circuit",
    kind: "frame",
    label: "E-CIRCUIT",
    price: 150,
    color: "#32d7ae"
  },
  {
    id: "frame-scooter",
    kind: "frame",
    label: "SCOOTER PULSE",
    price: 250,
    color: "#a78bfa"
  },
  {
    id: "frame-titanium",
    kind: "frame",
    label: "TITANIUM",
    price: 400,
    color: "#5b9ff0"
  }
];
const PROFILE_SHOP_DDL = [
  `CREATE TABLE IF NOT EXISTS profile_purchases (
      telegram_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('role', 'frame')),
      label TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price > 0),
      created_at TEXT NOT NULL,
      PRIMARY KEY (telegram_id, item_id)
    )`,
  `CREATE TRIGGER IF NOT EXISTS profile_purchase_debit
      AFTER INSERT ON profile_purchases
      BEGIN
        UPDATE users SET tokens = tokens - NEW.price WHERE telegram_id = NEW.telegram_id;
        INSERT INTO jet_transactions (telegram_id, amount, reason, created_at)
        VALUES (NEW.telegram_id, -NEW.price, 'JET Shop · ' || NEW.label, NEW.created_at);
      END`,
  `CREATE TABLE IF NOT EXISTS achievement_xp_grants (
      telegram_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      PRIMARY KEY (telegram_id, achievement_id)
    )`,
  `CREATE TRIGGER IF NOT EXISTS achievement_xp_credit
      AFTER INSERT ON achievement_xp_grants
      BEGIN
        UPDATE users
        SET xp = xp + 100, level = MAX(level, 1 + (xp + 100) / 100)
        WHERE telegram_id = NEW.telegram_id;
      END`,
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Id, X-Admin-Key, X-Telegram-Init-Data, Authorization',
};

const MEMORY_USERS = new Map();
let MEMORY_MAINTENANCE = false;
let d1Initialized = false;

function getD1(env) {
  return env?.DB || env?.alexov_shop_db || null;
}

function parseRewardsArray(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean);
      }
    } catch {
      return raw
        .split(',')
        .map((s) => s.trim().replace(/^\[|\]$|^"|"$/g, ''))
        .filter(Boolean);
    }
  }
  return ['early-rider'];
}

/**
 * Розрахунок автоматично виданих ачівок за вислугою часу перебування в проєкті.
 */
function calculateTenureAchievements(createdAtIso) {
  const elapsedDays = (Date.now() - Date.parse(createdAtIso)) / 86_400_000;
  return TENURE_REWARDS.filter(([, days]) => elapsedDays >= days).map(([id]) => id);
}

const FOUNDER_STATUS_SQL = `telegram_id IN (
  SELECT telegram_id FROM users
  ORDER BY julianday(created_at) ASC, telegram_id ASC LIMIT 50
) AS is_founder`;

/**
 * Криптографічна перевірка Telegram WebApp initData (HMAC-SHA-256)
 */
async function verifyTelegramInitData(initDataRaw, botToken) {
  if (!botToken) return null;
  if (!initDataRaw || typeof initDataRaw !== 'string') return null;
  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    if (!hash) return null;

    const pairs = [];
    for (const [key, value] of params.entries()) {
      if (key !== 'hash') {
        pairs.push(`${key}=${value}`);
      }
    }
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const encoder = new TextEncoder();
    const secretKeyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const secretKeyBuffer = await crypto.subtle.sign('HMAC', secretKeyMaterial, encoder.encode(botToken));

    const hmacKey = await crypto.subtle.importKey(
      'raw',
      secretKeyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(dataCheckString));
    const computedHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (computedHex !== hash.toLowerCase()) {
      return null;
    }

    const userRaw = params.get('user');
    return userRaw ? JSON.parse(userRaw) : null;
  } catch {
    return null;
  }
}

/**
 * Перевірка авторизації адміністратора (ID: 5905168657) для серверних запитів /api/admin/*
 */
async function isAuthorizedAdminRequest(request, body, env) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  const key = request.headers.get('X-Admin-Key') ||
    request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (env?.ADMIN_SECRET_KEY && key === env.ADMIN_SECRET_KEY) return true;
  return Boolean(env?.BOT_TOKEN) &&
    await economyIdentity(request, env.BOT_TOKEN, body ?? {}) === ADMIN_TELEGRAM_ID;
}

async function ensureD1Schema(db) {
  if (!db || d1Initialized) return;
  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS users (
          telegram_id TEXT PRIMARY KEY,
          username TEXT DEFAULT '',
          first_name TEXT DEFAULT 'Rider',
          last_name TEXT DEFAULT '',
          photo_url TEXT DEFAULT '',
          tokens INTEGER NOT NULL DEFAULT 100,
          roles TEXT NOT NULL DEFAULT 'RIDER',
          tags TEXT NOT NULL DEFAULT 'RIDER',
          xp INTEGER NOT NULL DEFAULT 50,
          level INTEGER NOT NULL DEFAULT 1,
          rewards TEXT NOT NULL DEFAULT '["early-rider"]',
          created_at TEXT NOT NULL,
          last_login_at TEXT NOT NULL
        )`
      )
      .run();

    // Безпечні міграції колонок для існуючих таблиць
    await db.prepare(`ALTER TABLE users ADD COLUMN roles TEXT NOT NULL DEFAULT 'RIDER'`).run().catch(() => {});
    await db.prepare(`ALTER TABLE users ADD COLUMN rewards TEXT NOT NULL DEFAULT '["early-rider"]'`).run().catch(() => {});

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`
      )
      .run();

    await db
      .prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('maintenance_mode', '0')`)
      .run();

    // jet_transactions table
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS jet_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          telegram_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`
      )
      .run();

    // Safe migrations for referral and activity reward columns
    await db.prepare(`ALTER TABLE users ADD COLUMN referred_by TEXT DEFAULT ''`).run().catch(() => {});
    await db.prepare(`ALTER TABLE users ADD COLUMN activity_rewarded_at TEXT DEFAULT ''`).run().catch(() => {});
    await db.prepare(`ALTER TABLE users ADD COLUMN session_active_at TEXT DEFAULT ''`).run().catch(() => {});

    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT OR IGNORE INTO users (
          telegram_id, username, first_name, last_name, photo_url, tokens, roles, tags, xp, level, rewards, created_at, last_login_at
        ) VALUES (?, 'cry1444me', 'IVFX.exe #cry1444me', '', '', 100, '\u2020 FOUNDER \u2020', '\u2020 FOUNDER \u2020', 500, 5, '["early-rider","tenure-7d","tenure-1m","tenure-6m","tenure-1y","founder-seal","god-mode"]', ?, ?)`
      )
      .bind(ADMIN_TELEGRAM_ID, now, now)
      .run();

    await db.prepare(`ALTER TABLE users ADD COLUMN jet_peak INTEGER NOT NULL DEFAULT 100`).run().catch(() => {});
    await db.prepare(`CREATE TRIGGER IF NOT EXISTS users_record_jet_peak
      AFTER UPDATE OF tokens ON users
      WHEN MAX(OLD.tokens, NEW.tokens) > NEW.jet_peak
      BEGIN
        UPDATE users SET jet_peak = MAX(OLD.tokens, NEW.tokens)
        WHERE telegram_id = NEW.telegram_id;
      END;`).run();
    await db.prepare(`UPDATE users SET jet_peak = tokens WHERE tokens > jet_peak`).run();

    await db.prepare(`ALTER TABLE users ADD COLUMN profile_frame_id TEXT NOT NULL DEFAULT ''`).run().catch(() => {});
    await db.prepare(`ALTER TABLE users ADD COLUMN profile_frame_color TEXT NOT NULL DEFAULT ''`).run().catch(() => {});
    for (const statement of PROFILE_SHOP_DDL) await db.prepare(statement).run();
    d1Initialized = true;
  } catch {}
}


const ROLE_ACHIEVEMENT_IDS = "'role-collector-5', 'role-club-elite', 'role-magnate'";
const ROLE_ACHIEVEMENTS_SQL = `SELECT achievement_id FROM achievement_xp_grants
  WHERE telegram_id = ? AND achievement_id IN (${ROLE_ACHIEVEMENT_IDS}) ORDER BY achievement_id`;
const WEB_REWARDS_SQL = `(
  SELECT json_group_array(achievement_id) FROM (
    SELECT event AS achievement_id FROM web_achievement_events WHERE telegram_id = users.telegram_id
    UNION ALL
    SELECT achievement_id FROM achievement_xp_grants
    WHERE telegram_id = users.telegram_id AND achievement_id IN (${ROLE_ACHIEVEMENT_IDS})
  )
) AS web_rewards`;
const SHOP_ROLES_SQL = `(
  SELECT group_concat(purchase.label, ', ') FROM profile_purchases purchase
  WHERE purchase.telegram_id = users.telegram_id AND purchase.kind = 'role'
) AS shop_roles`;

const KNOWN_REWARDS_SQL = ALL_ACHIEVEMENT_IDS.map((id) => "'"+id+"'").join(', ');
const TENURE_RULES_SQL = TENURE_REWARDS.map(([id, days]) => "( '" + id + "', " + days + " )").join(', ');
const JET_RULES_SQL = JET_REWARDS.map(([id, amount]) => "( '" + id + "', " + amount + " )").join(', ');

// A unique grant credits XP inside the same statement. A reset or retry cannot pay it twice.
async function syncAchievementXP(db, telegramId) {
  const query = db.prepare(`
    WITH
      candidate_users AS (
        SELECT *, ${FOUNDER_STATUS_SQL} FROM users ${telegramId ? 'WHERE telegram_id = ?' : ''}
      ),
      tenure_rules(achievement_id, days) AS (VALUES ${TENURE_RULES_SQL}),
      jet_rules(achievement_id, amount) AS (VALUES ${JET_RULES_SQL}),
      eligible(telegram_id, achievement_id) AS (
        SELECT u.telegram_id,
          CASE WHEN reward.type = 'object' THEN json_extract(reward.value, '$.id')
               ELSE trim(CAST(reward.value AS TEXT), ' []"') END AS achievement_id
        FROM candidate_users u, json_each(
          CASE WHEN json_valid(u.rewards) THEN
            CASE WHEN json_type(u.rewards) = 'array' THEN u.rewards ELSE '["early-rider"]' END
          WHEN trim(COALESCE(u.rewards, '')) = '' THEN '["early-rider"]'
          ELSE '[' || replace(json_quote(u.rewards), ',', '","') || ']' END
        ) reward
        WHERE achievement_id IN (${KNOWN_REWARDS_SQL}) AND achievement_id NOT IN ('first-visit','explorer','first-order','collector')
        UNION ALL
        SELECT telegram_id, achievement_id FROM candidate_users CROSS JOIN tenure_rules
        WHERE julianday('now') >= julianday(created_at) + days
        UNION ALL
        SELECT telegram_id, achievement_id FROM candidate_users CROSS JOIN jet_rules
        WHERE MAX(tokens, jet_peak) >= amount
        UNION ALL
        SELECT telegram_id, 'founder-50' FROM candidate_users WHERE is_founder
      )
    INSERT OR IGNORE INTO achievement_xp_grants (telegram_id, achievement_id)
    SELECT e.telegram_id, e.achievement_id FROM eligible e
    WHERE NOT EXISTS (
      SELECT 1 FROM achievement_xp_grants g
      WHERE g.telegram_id = e.telegram_id AND g.achievement_id = e.achievement_id
    )
  `);
  await (telegramId ? query.bind(telegramId) : query).run();
}

async function readProgressProfile(db, telegramId) {
  await syncAchievementXP(db, telegramId);
  const row = await db.prepare(`SELECT *, ${FOUNDER_STATUS_SQL}, ${SHOP_ROLES_SQL}, ${WEB_REWARDS_SQL}
    FROM users WHERE telegram_id = ?`).bind(telegramId).first();
  if (row) {
    try {
      const {results} = await db.prepare('SELECT r.* FROM user_roles u JOIN shop_roles r ON r.id=u.role_id WHERE u.telegram_id=? ORDER BY r.price,r.id').bind(telegramId).all();
      row.owned_roles = results;
      row.shop_roles = '';
    } catch {}
  }
  return mapRowToProfile(row);
}

function shopResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}

const TERMS_VERSION = '2026-11-13.5';

async function recordTerms(request, env, token) {
  const body = await request.json().catch(() => null);
  if (!body || !['visit', 'accept'].includes(body.action) || !['uk', 'en'].includes(body.locale)) {
    return shopResponse({ ok: false, error: 'invalid-terms-request' }, 400);
  }
  if (body.version !== TERMS_VERSION) return shopResponse({ ok: false, error: 'terms-version-mismatch' }, 409);

  let subjectType = 'browser';
  let subjectId = body.visitor;
  if (body.initData) {
    const user = await verifyTelegramInitData(body.initData, token);
    const issuedAt = typeof body.initData === 'string' ? Number(new URLSearchParams(body.initData).get('auth_date')) : 0;
    const age = Date.now() / 1000 - issuedAt;
    if (!Number.isSafeInteger(user?.id) || user.id <= 0 || !Number.isSafeInteger(issuedAt) || age < -60 || age > 86_400) {
      return shopResponse({ ok: false, error: 'invalid-telegram-session' }, 401);
    }
    subjectType = 'telegram';
    subjectId = String(user.id);
  } else if (typeof subjectId !== 'string' || !/^[0-9a-f]{32}$/.test(subjectId)) {
    return shopResponse({ ok: false, error: 'invalid-browser-id' }, 400);
  }

  const db = getD1(env);
  if (!db) return shopResponse({ ok: false, error: 'terms-storage-unavailable' }, 503);
  const now = new Date().toISOString();
  const accepted = body.action === 'accept';
  await db.prepare(`INSERT INTO terms_records
    (subject_type, subject_id, policy_version, first_visited_at, terms_accepted, accepted_at, accepted_locale)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (subject_type, subject_id, policy_version) DO UPDATE SET
      terms_accepted = excluded.terms_accepted,
      accepted_at = excluded.accepted_at,
      accepted_locale = excluded.accepted_locale
    WHERE terms_records.terms_accepted = 0 AND excluded.terms_accepted = 1`)
    .bind(subjectType, subjectId, TERMS_VERSION, now, Number(accepted), accepted ? now : null, accepted ? body.locale : null)
    .run();
  return shopResponse({ ok: true });
}

const PROFILE_SESSION = 'alexov_profile_session';
const PROFILE_SESSION_SECONDS = 30 * 24 * 60 * 60;

async function profileSessionKey(token) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode('alexov-profile-session:' + token), {
    name: 'HMAC', hash: 'SHA-256',
  }, false, ['sign', 'verify']);
}

async function createProfileSession(id, token) {
  const data = `${id}.${Math.floor(Date.now() / 1000) + PROFILE_SESSION_SECONDS}`;
  const bytes = await crypto.subtle.sign('HMAC', await profileSessionKey(token), new TextEncoder().encode(data));
  const signature = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${PROFILE_SESSION}=${data}.${signature}; Max-Age=${PROFILE_SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function readProfileSession(request, token) {
  if (!token) return null;
  const value = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)alexov_profile_session=([^;]+)/)?.[1];
  const parts = value?.match(/^(\d{1,16})\.(\d{1,12})\.([0-9a-f]{64})$/);
  if (!parts || Number(parts[2]) <= Date.now() / 1000) return null;
  const signature = Uint8Array.from(parts[3].match(/../g), (byte) => parseInt(byte, 16));
  return await crypto.subtle.verify('HMAC', await profileSessionKey(token), signature,
    new TextEncoder().encode(parts[1] + '.' + parts[2])) ? parts[1] : null;
}

async function verifyShopLaunch(initData, token) {
  if (typeof initData !== 'string' || !initData || initData.length > 16_384) return null;
  const authDate = Number(new URLSearchParams(initData).get('auth_date'));
  const age = Date.now() / 1000 - authDate;
  if (!Number.isSafeInteger(authDate) || age < -60 || age > 86_400) return null;
  const user = await verifyTelegramInitData(initData, token);
  return Number.isSafeInteger(user?.id) && user.id > 0 ? user : null;
}

async function handleProfile(request, env, token) {
  const db = getD1(env);
  let profile;
  let cookie;
  const body = request.method === 'POST' ? await request.json().catch(() => null) : null;
  const initData = (typeof body?.initData === 'string' && body.initData) || request.headers.get('X-Telegram-Init-Data') || '';
  const user = await verifyShopLaunch(initData, token);
  if (user) {
    const params = new URLSearchParams(initData);
    profile = await upsertUserInD1(env, user);
    if (db && profile) {
      const referrer = params.get('start_param')?.match(/^ref_(\d+)$/)?.[1];
      const userId = String(user.id);
      if (referrer && referrer !== userId) {
        const updated = await db.prepare(`UPDATE users SET referred_by = ?, tokens = tokens + 100
          WHERE telegram_id = ? AND COALESCE(referred_by, '') = ''
          AND EXISTS (SELECT 1 FROM users WHERE telegram_id = ?) RETURNING telegram_id`)
          .bind(referrer, userId, referrer).first();
        if (updated) {
          await db.prepare('UPDATE users SET tokens = tokens + 100 WHERE telegram_id = ?').bind(referrer).run();
          await insertJetTransaction(db, userId, 100, 'Реферальний бонус');
          await insertJetTransaction(db, referrer, 100, 'Реферальний бонус');
          profile = await readProgressProfile(db, userId);
        }
      }
    }
    cookie = await createProfileSession(user.id, token);
  } else {
    const id = await readProfileSession(request, token);
    if (!id) return shopResponse({ ok: true, success: true, authenticated: false, isAdmin: false, telegram_id: null, profile: null });
    if (db) await ensureD1Schema(db);
    profile = db ? await readProgressProfile(db, id) : MEMORY_USERS.get(id);
  }
  if (!profile) return shopResponse({ ok: false, error: 'profile-unavailable' }, 404);
  if (db) {
    await db.prepare("INSERT OR IGNORE INTO web_achievement_events(telegram_id,event) VALUES(?,'first-visit')").bind(String(profile.id)).run();
    profile = await readProgressProfile(db,String(profile.id));
  }
  const response = shopResponse({ ok: true, success: true, authenticated: true,
    isAdmin: String(profile.id) === ADMIN_TELEGRAM_ID, telegram_id: String(profile.id),
    profile, maintenanceMode: await getMaintenanceState(env) });
  if (cookie) response.headers.set('Set-Cookie', cookie);
  return response;
}

async function handleProfileShop(request, env, token) {
  const body = await request.json().catch(() => null);
  const signedUser = await verifyTelegramInitData(body?.initData, token);
  const signedAt = Number(typeof body?.initData === 'string' && new URLSearchParams(body.initData).get('auth_date'));
  const ageSeconds = Date.now() / 1000 - signedAt;
  if (!signedUser?.id || !Number.isFinite(signedAt) || ageSeconds > 86_400 || ageSeconds < -60) {
    return shopResponse({ ok: false, error: 'telegram-auth' }, 401);
  }
  const telegramId = String(signedUser.id);
  const db = getD1(env);
  if (!db) return shopResponse({ ok: false, error: 'unavailable' }, 503);
  await ensureD1Schema(db);

  const item = PROFILE_SHOP_ITEMS.find(({ id }) => id === body.itemId);
  if (body.action === 'buy' && item?.kind === 'role') {
    const result = await handleRoleEconomy(new Request(new URL('/api/shop/buy-role', request.url), {method:'POST',headers:request.headers,body:JSON.stringify({initData:body.initData,role_id:item.id})}),env,token);
    if (!result.ok) return result;
    body.action = 'list';
  }
  if (body.action === 'buy' && item) {
    // Selecting from users guards the balance and the trigger debits and logs this exact purchase.
    await db.prepare(`INSERT OR IGNORE INTO profile_purchases
      (telegram_id, item_id, kind, label, price, created_at)
      SELECT telegram_id, ?, ?, ?, ?, ? FROM users WHERE telegram_id = ? AND tokens >= ?`)
      .bind(item.id, item.kind, item.label, item.price, new Date().toISOString(), telegramId, item.price)
      .run();
    const purchase = await db.prepare(`SELECT 1 FROM profile_purchases WHERE telegram_id = ? AND item_id = ?`)
      .bind(telegramId, item.id).first();
    if (!purchase) return shopResponse({ ok: false, error: 'insufficient-jet' }, 409);
  } else if (body.action === 'equip' && (item?.kind === 'frame' || body.itemId === '')) {
    const color = body.color || item?.color || '';
    if (item && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) {
      return shopResponse({ ok: false, error: 'invalid-color' }, 400);
    }
    const frameId = item?.id || '';
    const updated = await db.prepare(`UPDATE users SET profile_frame_id = ?, profile_frame_color = ?
      WHERE telegram_id = ? AND (? = '' OR EXISTS (
        SELECT 1 FROM profile_purchases WHERE telegram_id = ? AND item_id = ? AND kind = 'frame'
      )) RETURNING telegram_id`)
      .bind(frameId, item ? color.toLowerCase() : '', telegramId, frameId, telegramId, frameId)
      .first();
    if (!updated) return shopResponse({ ok: false, error: 'not-owned' }, 403);
  } else if (body.action !== 'list') {
    return shopResponse({ ok: false, error: 'invalid-item' }, 400);
  }

  const profile = await readProgressProfile(db, telegramId);
  if (!profile) return shopResponse({ ok: false, error: 'missing-profile' }, 404);
  const { results } = await db.prepare(`SELECT item_id FROM profile_purchases WHERE telegram_id = ?`)
    .bind(telegramId).all();
  const owned = results.map((row) => row.item_id);
  try {
    const roles = await db.prepare('SELECT role_id FROM user_roles WHERE telegram_id=?').bind(telegramId).all();
    owned.push(...roles.results.map(row=>row.role_id));
  } catch {}
  return shopResponse({ ok: true, profile, catalog: PROFILE_SHOP_ITEMS, owned: [...new Set(owned)] });
}

function mapRowToProfile(row) {
  if (!row) return null;
  const tgId = String(row.telegram_id || row.id || '');
  const isAdmin = tgId === ADMIN_TELEGRAM_ID;
  const defaultRole = isAdmin ? '\u2020 FOUNDER \u2020' : 'RIDER';
  const originalRoles = String(row.roles || row.tags || defaultRole).trim() || defaultRole;
  const rolesStr = [...new Set([originalRoles, row.shop_roles].filter(Boolean).join(',').split(',').map((role) => role.trim()))].join(', ');
  const primaryRole =
    rolesStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)[0] || defaultRole;
  const baseRewards = parseRewardsArray(row.rewards)
    .filter((id) => id !== 'founder-50' || row.is_founder === undefined);
  const jetPeak = Math.max(Number(row.tokens ?? 100), Number(row.jet_peak ?? row.jetPeak ?? 100));
  const jetRewards = JET_REWARDS.filter(([, threshold]) => jetPeak >= threshold).map(([id]) => id);
  const tenureRewards = calculateTenureAchievements(row.created_at || row.createdAt);
  const webIds = ['first-visit','explorer','first-order','collector'];
  const rewardsList = Array.from(new Set([...baseRewards.filter(id=>ALL_ACHIEVEMENT_IDS.includes(id) && !webIds.includes(id)), ...tenureRewards, ...jetRewards, ...parseRewardsArray(row.web_rewards || '[]')]));
  if (row.is_founder) rewardsList.push('founder-50');

  return {
    id: tgId,
    telegram_id: tgId,
    firstName: row.first_name || row.firstName || 'Rider',
    lastName: row.last_name || row.lastName || '',
    username: row.username || '',
    photoUrl: row.photo_url || row.photoUrl || '',
    tokens: typeof row.tokens === 'number' ? row.tokens : Number(row.tokens ?? 100),
    jetPeak,
    frameId: row.profile_frame_id || '',
    frameColor: row.profile_frame_color || '',
    ownedRoles: row.owned_roles || [],
    activeRole: row.owned_roles?.find(role => role.id === row.active_role_id) || null,
    xp: typeof row.xp === 'number' ? row.xp : Number(row.xp ?? (isAdmin ? 500 : 50)),
    level: typeof row.level === 'number' ? row.level : Number(row.level ?? (isAdmin ? 5 : 1)),
    roles: rolesStr,
    tags: row.tags || rolesStr,
    rankTitleUk: primaryRole,
    rankTitleEn: primaryRole,
    rewards: rewardsList,
    ordersCount: Number(row.orders_count ?? row.ordersCount ?? 0),
    isAdmin,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    lastLoginAt: row.last_login_at || row.lastLoginAt || new Date().toISOString(),
  };
}

/**
 * Авторизація та реєстрація користувача в D1.
 * ВАЖЛИВО: Ніколи не приймає tokens, roles, tags, level, xp, rewards з клієнта —
 * ці поля зберігаються і змінюються виключно на сервері!
 */
async function upsertUserInD1(env, rawUser) {
  const tgId = String(rawUser?.id || rawUser?.telegram_id || '').trim();
  if (!tgId) return null;

  const now = new Date().toISOString();
  const isAdmin = tgId === ADMIN_TELEGRAM_ID;
  const username = String(rawUser.username || '').replace(/^@/, '').trim();
  const firstName = String(rawUser.first_name || rawUser.firstName || 'Rider').trim();
  const lastName = String(rawUser.last_name || rawUser.lastName || '').trim();
  const photoUrl = String(rawUser.photo_url || rawUser.photoUrl || '').trim();
  const defaultRoles = isAdmin ? '\u2020 FOUNDER \u2020' : 'RIDER';
  const defaultXp = isAdmin ? 500 : 50;
  const defaultLevel = isAdmin ? 5 : 1;
  const defaultRewards = isAdmin
    ? '["early-rider","tenure-7d","tenure-1m","tenure-6m","tenure-1y","founder-seal","god-mode"]'
    : '["early-rider"]';

  const db = getD1(env);
  if (db) {
    await ensureD1Schema(db);
    const existing = await db
      .prepare(`SELECT * FROM users WHERE telegram_id = ?`)
      .bind(tgId)
      .first();

    if (!existing) {
      await db
        .prepare(
          `INSERT INTO users (
            telegram_id, username, first_name, last_name, photo_url, tokens, roles, tags, xp, level, rewards, created_at, last_login_at
          ) VALUES (?, ?, ?, ?, ?, 100, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          tgId,
          username,
          firstName,
          lastName,
          photoUrl,
          defaultRoles,
          defaultRoles,
          defaultXp,
          defaultLevel,
          defaultRewards,
          now,
          now
        )
        .run();
      // Log starting bonus transaction for new users
      await insertJetTransaction(db, tgId, 100, 'Стартовий бонус за реєстрацію (+100 JET)');
    } else {
      const updatedUsername = username || existing.username || '';
      const updatedFirstName = firstName || existing.first_name || 'Rider';
      const updatedLastName = lastName || existing.last_name || '';
      const updatedPhotoUrl = photoUrl || existing.photo_url || '';

      await db
        .prepare(
          `UPDATE users
           SET username = ?, first_name = ?, last_name = ?, photo_url = ?, session_active_at = COALESCE(NULLIF(session_active_at, ''), ?), last_login_at = ?
           WHERE telegram_id = ?`
        )
        .bind(updatedUsername, updatedFirstName, updatedLastName, updatedPhotoUrl, now, now, tgId)
        .run();
    }

    const mapped = await readProgressProfile(db, tgId);
    if (mapped) MEMORY_USERS.set(tgId, mapped);
    return mapped;
  }

  const prev = MEMORY_USERS.get(tgId);
  const tenureRewards = calculateTenureAchievements(prev?.createdAt || now);
  const basePrevRewards = prev?.rewards || JSON.parse(defaultRewards);
  const mergedMemoryRewards = Array.from(new Set([...basePrevRewards, ...tenureRewards]));

  const record = mapRowToProfile({
    telegram_id: tgId,
    username: username || prev?.username || '',
    first_name: firstName || prev?.firstName || 'Rider',
    last_name: lastName || prev?.lastName || '',
    photo_url: photoUrl || prev?.photoUrl || '',
    tokens: typeof prev?.tokens === 'number' ? prev.tokens : 100,
    xp: typeof prev?.xp === 'number' ? prev.xp : defaultXp,
    level: typeof prev?.level === 'number' ? prev.level : defaultLevel,
    roles: isAdmin ? '\u2020 FOUNDER \u2020' : (prev?.roles || prev?.tags || defaultRoles),
    tags: isAdmin ? '\u2020 FOUNDER \u2020' : (prev?.tags || prev?.roles || defaultRoles),
    rewards: mergedMemoryRewards,
    created_at: prev?.createdAt || now,
    last_login_at: now,
  });
  MEMORY_USERS.set(tgId, record);
  return record;
}

/**
 * Вставка запису транзакції JET в таблицю jet_transactions.
 */
async function insertJetTransaction(db, telegramId, amount, reason) {
  if (!db || !telegramId || !amount) return;
  try {
    const now = new Date().toISOString();
    await db
      .prepare(`INSERT INTO jet_transactions (telegram_id, amount, reason, created_at) VALUES (?, ?, ?, ?)`)
      .bind(String(telegramId), Number(amount), String(reason), now)
      .run();
  } catch {}
}

/**
 * Серверна функція оновлення даних користувача в D1 (викликається тільки після перевірки прав адміністратора)
 */
async function updateUserRecordServerSide(env, payload) {
  const targetId = String(payload?.targetId || payload?.telegram_id || '').trim();
  if (!targetId) return null;

  const now = new Date().toISOString();
  const db = getD1(env);

  if (db) {
    await ensureD1Schema(db);
    let existing = await db
      .prepare(`SELECT * FROM users WHERE telegram_id = ?`)
      .bind(targetId)
      .first();

    if (!existing) {
      await db
        .prepare(
          `INSERT INTO users (
            telegram_id, username, first_name, last_name, photo_url, tokens, roles, tags, xp, level, rewards, created_at, last_login_at
          ) VALUES (?, ?, ?, '', '', 100, 'RIDER', 'RIDER', 50, 1, '["early-rider"]', ?, ?)`
        )
        .bind(
          targetId,
          String(payload?.username || '').replace(/^@/, '').trim(),
          String(payload?.firstName || 'Rider').trim(),
          now,
          now
        )
        .run();
      existing = await db
        .prepare(`SELECT * FROM users WHERE telegram_id = ?`)
        .bind(targetId)
        .first();
    }

    let nextTokens = Number(existing?.tokens ?? 100);
    if (typeof payload?.tokens === 'number' && !Number.isNaN(payload.tokens)) {
      nextTokens = Math.max(0, Math.floor(payload.tokens));
    } else if (typeof payload?.deltaTokens === 'number' && !Number.isNaN(payload.deltaTokens)) {
      nextTokens = Math.max(0, Math.floor(nextTokens + payload.deltaTokens));
    }

    let nextLevel = Number(existing?.level ?? 1);
    if (typeof payload?.level === 'number' && !Number.isNaN(payload.level)) {
      nextLevel = Math.max(1, Math.floor(payload.level));
    } else if (typeof payload?.deltaLevel === 'number' && !Number.isNaN(payload.deltaLevel)) {
      nextLevel = Math.max(1, Math.floor(nextLevel + payload.deltaLevel));
    }

    let nextXp = Number(existing?.xp ?? 50);
    if (typeof payload?.xp === 'number' && !Number.isNaN(payload.xp)) {
      nextXp = Math.max(0, Math.floor(payload.xp));
    } else if (typeof payload?.deltaXp === 'number' && !Number.isNaN(payload.deltaXp)) {
      nextXp = Math.max(0, Math.floor(nextXp + payload.deltaXp));
    }

    const rawRoleInput =
      typeof payload?.roles === 'string' && payload.roles.trim()
        ? payload.roles.trim()
        : typeof payload?.tags === 'string' && payload.tags.trim()
          ? payload.tags.trim()
          : '';

    const existingRewards = parseRewardsArray(existing?.rewards);
    const nextRewardsArr = Array.isArray(payload?.rewards)
      ? payload.rewards.map((x) => String(x).trim()).filter(Boolean)
      : existingRewards;
    const nextRewardsJson = JSON.stringify(nextRewardsArr.length ? nextRewardsArr : ['early-rider']);

    await db
      .prepare(
        `UPDATE users
         SET tokens = COALESCE(?, tokens), roles = COALESCE(?, roles), tags = COALESCE(?, tags),
             level = COALESCE(?, level), xp = COALESCE(?, xp), rewards = COALESCE(?, rewards)
         WHERE telegram_id = ?`
      )
      .bind(
        typeof payload?.tokens === 'number' || typeof payload?.deltaTokens === 'number' ? nextTokens : null,
        rawRoleInput || null,
        rawRoleInput || null,
        typeof payload?.level === 'number' || typeof payload?.deltaLevel === 'number' ? nextLevel : null,
        typeof payload?.xp === 'number' || typeof payload?.deltaXp === 'number' ? nextXp : null,
        Array.isArray(payload?.rewards) ? nextRewardsJson : null,
        targetId,
      )
      .run();

    // Log JET transaction if tokens changed
    const prevTokens = Number(existing?.tokens ?? 100);
    const deltaTokens = nextTokens - prevTokens;
    if (deltaTokens !== 0) {
      const reason = String(payload?.reason || 'Адмінська правка');
      await insertJetTransaction(db, targetId, deltaTokens, reason);
    }

    const updatedProfile = await readProgressProfile(db, targetId);
    if (updatedProfile) MEMORY_USERS.set(targetId, updatedProfile);
    return updatedProfile;
  }

  return null;
}

async function getMaintenanceState(env) {
  const db = getD1(env);
  if (db) {
    try {
      await ensureD1Schema(db);
      const row = await db
        .prepare(`SELECT value FROM app_settings WHERE key = 'maintenance_mode'`)
        .first();
      if (row && typeof row.value === 'string') {
        MEMORY_MAINTENANCE = row.value === '1' || row.value === 'true';
        return MEMORY_MAINTENANCE;
      }
    } catch {}
  }
  return MEMORY_MAINTENANCE;
}

async function setMaintenanceState(env, enabled) {
  MEMORY_MAINTENANCE = Boolean(enabled);
  const db = getD1(env);
  if (db) {
    try {
      await ensureD1Schema(db);
      await db
        .prepare(
          `INSERT INTO app_settings (key, value) VALUES ('maintenance_mode', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .bind(enabled ? '1' : '0')
        .run();
    } catch {}
  }
  return MEMORY_MAINTENANCE;
}

async function sendTelegramMessage(token, chatId, text, extra = {}) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...extra,
    }),
  });
}

async function sendToOrdersGroup(token, method, buildBodyFn, groupId = ORDERS_GROUP_ID) {
  const apiUrl = `https://api.telegram.org/bot${token}/${method}`;
  let response = await fetch(apiUrl, {
    method: 'POST',
    ...buildBodyFn(groupId),
  });

  if (!response.ok) {
    try {
      const errData = await response.clone().json();
      const migratedChatId = errData?.parameters?.migrate_to_chat_id;
      if (migratedChatId) {
        response = await fetch(apiUrl, {
          method: 'POST',
          ...buildBodyFn(String(migratedChatId)),
        });
      }
    } catch {}
  }

  return response;
}


const ORDER_KEY_PATTERN = /^[0-9a-f]{32}$/;
const D1_RECEIPT_LIMIT = 1_900_000;

async function orderIpHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !env.ORDER_IP_HASH_SECRET) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(env.ORDER_IP_HASH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(ip));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function escapeOrderHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function orderCaption(orderId, customerId, telegramId, username, order) {
  const contact = username
    ? `<a href="https://t.me/${username.slice(1)}">${username}</a>`
    : '❌ Не вказано (зв’язок за телефоном)';
  const escape = escapeOrderHtml;
  return [
    `📦 <b>Нове замовлення #${orderId}</b>`,
    `Товар: ${escape(order.productTitle)}`,
    ...(order.color ? [`Колір: ${escape(order.color)}`] : []),
    ...(order.size ? [`Розмір: ${escape(order.size)}`] : []),
    `Кількість: ${escape(order.qty)} | Сума: ${escape(order.totalAmount)} грн`,
    '',
    '<b>👤 ІНФОРМАЦІЯ ПРО КЛІЄНТА:</b>',
    `• Ім’я: ${escape(order.fullName)}`,
    `• Телефон: ${escape(order.phone)}`,
    `• Доставка: ${escape(order.npBranch)}`,
    `• Telegram Username: ${contact}`,
    telegramId
      ? `• Telegram ID: <a href="tg://user?id=${telegramId}">${telegramId}</a>`
      : `• Внутрішній ID клієнта: <code>${customerId}</code>`,
  ].join('\n');
}

async function notifyShopOrder(token, caption, receipt, groupId) {
  const methods = receipt ? ['sendPhoto', 'sendDocument', 'sendMessage'] : ['sendMessage'];
  for (const method of methods) {
    try {
      const response = await sendToOrdersGroup(token, method, (chatId) => {
        if (method === 'sendMessage') {
          return {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: receipt ? '⚠️ Вкладення не доставлено до Telegram. Перевірте запис у D1.\n\n' + caption : caption,
              parse_mode: 'HTML',
              link_preview_options: { is_disabled: true },
            }),
          };
        }
        const form = new FormData();
        form.set('chat_id', chatId);
        form.set('caption', caption);
        form.set('parse_mode', 'HTML');
        form.set(method === 'sendPhoto' ? 'photo' : 'document', receipt, receipt.name || 'receipt');
        return { body: form };
      }, groupId);
      const result = await response.json().catch(() => null);
      if (response.ok && result?.ok) {
        return {
          status: receipt && method === 'sendMessage' ? 'message_only' : 'sent',
          messageId: result.result?.message_id ?? null,
          chatId: result.result?.chat?.id != null ? String(result.result.chat.id) : null,
          fileId: result.result?.document?.file_id ?? result.result?.photo?.at(-1)?.file_id ?? null,
        };
      }
    } catch {
      // Try the next delivery method without exposing Telegram errors or tokens.
    }
  }
  return { status: 'failed', messageId: null, chatId: null, fileId: null };
}

async function handleShopOrder(request, env, token) {
  const db = getD1(env);
  if (!db) {
    console.error('Order storage unavailable: D1 binding DB missing');
    return shopResponse({ ok: false, error: 'order-storage-unavailable' }, 503);
  }

  let payload;
  try {
    payload = request.headers.get('content-type')?.includes('application/json')
      ? await request.json()
      : await request.formData();
  } catch {
    return shopResponse({ ok: false, error: 'invalid-order-request' }, 400);
  }
  const read = (key) => payload instanceof FormData ? payload.get(key) : payload?.[key];
  const telegramUser = await verifyShopLaunch(read('initData'), token);
  const telegramId = telegramUser ? String(telegramUser.id) : await readProfileSession(request, token);
  const text = (key, max) => String(read(key) ?? '').trim().slice(0, max);
  // An optional contact can help fulfilment but cannot prevent recording a paid order.
  const handle = text('tgUser', 34).replace(/^@/, '');
  const username = /^[A-Za-z0-9_]{5,32}$/.test(handle) ? '@' + handle : '';
  const order = {
    productTitle: text('productTitle', 100) || 'Alexov Shop',
    color: text('color', 40), size: text('size', 24), qty: text('qty', 12) || '1',
    price: text('price', 24), totalAmount: text('totalAmount', 24) || text('price', 24),
    fullName: text('fullName', 90), phone: text('phone', 40), npBranch: text('npBranch', 140),
  };
  const productId = text('productId', 65);
  if (productId) {
    try {
      const row = await db.prepare('SELECT ' + PRODUCT_DETAILS_SQL + ', hidden FROM products p WHERE id=?').bind(productId).first();
      const product = row && JSON.parse(row.details);
      const color = product?.colorVariants?.find(option => option.id === text('colorId', 65));
      if (!product || row.hidden || product.buttonAction !== 'order'
          || (product.colorVariants?.length && !color)
          || Number(order.totalAmount.replace(/[^\d]/g, '')) !== product.price) {
        return shopResponse({ ok: false, error: 'catalog-changed' }, 409);
      }
      order.productId = productId;
      order.productTitle = product.titleUk;
      order.color = color?.nameUk ?? '';
      order.qty = '1';
      order.price = order.totalAmount = String(product.price);
    } catch (error) {
      return shopResponse({ ok: false, error: 'order-storage-unavailable' }, 503);
    }
  }
  const receipt = [read('receipt'), read('screenshot')]
    .find((attachment) => attachment instanceof File && attachment.size) ?? null;
  const receiptMetadata = receipt ? JSON.stringify({
    name: receipt.name.slice(0, 255), type: receipt.type, size: receipt.size,
  }) : null;
  const browserKey = text('browserKey', 64);
  const submissionKey = text('submissionKey', 64);
  const browser = ORDER_KEY_PATTERN.test(browserKey) ? browserKey : crypto.randomUUID().replaceAll('-', '');
  const submission = ORDER_KEY_PATTERN.test(submissionKey) ? submissionKey : crypto.randomUUID().replaceAll('-', '');
  const createdAt = new Date().toISOString();
  let stored;

  try {
    const ipHash = await orderIpHash(request, env);
    const receiptData = receipt && receipt.size <= D1_RECEIPT_LIMIT ? await receipt.arrayBuffer() : null;
    const [, insert] = await db.batch([
      db.prepare(`INSERT INTO shop_order_customers (browser_key, created_at)
        SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM shop_order_customers WHERE browser_key = ?)`)
        .bind(browser, createdAt, browser),
      db.prepare(`INSERT INTO shop_orders (
          customer_id, submission_key, provided_username, order_details, telegram_id,
          receipt_data, receipt_metadata, created_at, ip_hash, previous_orders
        )
        SELECT customer.id, ?, ?, ?, ?, ?, ?, ?, ?,
          (SELECT COUNT(*) FROM shop_orders WHERE customer_id = customer.id)
        FROM shop_order_customers customer WHERE customer.browser_key = ?
        AND NOT EXISTS (
          SELECT 1 FROM shop_orders WHERE customer_id = customer.id AND submission_key = ?
        )
        RETURNING id, customer_id`)
        .bind(submission, username || null, JSON.stringify(order), telegramId, receiptData, receiptMetadata, createdAt, ipHash, browser, submission),
    ]);
    stored = insert.results?.[0];
    if (!stored) {
      const existing = await db.prepare(`SELECT orders.id, orders.delivery_status
        FROM shop_orders orders JOIN shop_order_customers customer ON customer.id = orders.customer_id
        WHERE customer.browser_key = ? AND orders.submission_key = ?`).bind(browser, submission).first();
      if (!existing) return shopResponse({ ok: false, error: 'order-storage-unavailable' }, 503);
      return shopResponse({ ok: true, orderNumber: String(existing.id), deliveredToTelegram: existing.delivery_status === 'sent' });
    }
  } catch (error) {
    const reason = /no such table|no such column|has no column/i.test(String(error))
      ? 'order schema incomplete; check order migrations 0002–0004'
      : 'D1 write failed';
    console.error('Order storage unavailable: ' + reason);
    return shopResponse({ ok: false, error: 'order-storage-unavailable' }, 503);
  }

  const caption = orderCaption(stored.id, stored.customer_id, telegramId, username, order);
  const delivery = await notifyShopOrder(token, caption, receipt, env.ORDERS_GROUP_ID);
  try {
    await db.prepare(`UPDATE shop_orders
      SET delivery_status = ?, telegram_message_id = ?, telegram_chat_id = ?, telegram_file_id = ?
      WHERE id = ?`).bind(delivery.status, delivery.messageId, delivery.chatId, delivery.fileId, stored.id).run();
  } catch {
    // The order has already been stored. Do not ask the buyer to create a second order.
  }
  return shopResponse({ ok: true, orderNumber: String(stored.id), deliveredToTelegram: delivery.status === 'sent' });
}


async function economyIdentity(request, token, body = {}) {
 const user = await verifyShopLaunch(body.initData || request.headers.get('X-Telegram-Init-Data'), token);
 return user ? String(user.id) : await readProfileSession(request, token);
}
async function handleJetActivity(request, env, token) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return shopResponse({ ok: false, error: 'origin-mismatch' }, 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return shopResponse({ ok: false, error: 'invalid-json' }, 400);
  const id = await economyIdentity(request, token, body);
  if (!id || (body.userId && String(body.userId) !== id)) return shopResponse({ ok: false, error: 'telegram-auth' }, 401);
  const db = getD1(env);
  if (!db) return shopResponse({ ok: false, error: 'activity-unavailable' }, 503);

  const now = Date.now();
  const seconds = Math.floor(now / 1000);
  const day = Math.floor(seconds / 86400);
  const hourlySlot = "MAX(jet_hourly_at, COALESCE(unixepoch(activity_rewarded_at), 0))";
  let change = null;
  if (url.pathname === '/api/jet/activity-reward') {
    change = await db.prepare(`UPDATE users SET jet_hourly_at = ?
      WHERE telegram_id = ? AND ${hourlySlot} <= ? RETURNING 50 AS credited`)
      .bind(seconds, id, seconds - 3600).first();
  } else if (url.pathname === '/api/jet/tap') {
    change = await db.prepare(`UPDATE users SET
      jet_tap_units = jet_tap_units + 10, jet_tap_last_ms = ?1,
      jet_tap_day_count = CASE WHEN jet_tap_day = ?2 THEN jet_tap_day_count + 1 ELSE 1 END,
      jet_tap_day = ?2
      WHERE telegram_id = ?3 AND ?1 - jet_tap_last_ms >= 250
        AND (jet_tap_day != ?2 OR jet_tap_day_count < 1200)
      RETURNING 10 AS tapped`).bind(now, day, id).first();
    if (!change) return shopResponse({ok:false,error:'tap-limit'},429);
  } else if (url.pathname === '/api/jet/exchange') {
    change = await db.prepare(`UPDATE users
      SET jet_tap_exchanged = jet_tap_exchanged + jet_tap_units / 100, jet_tap_units = jet_tap_units % 100
      WHERE telegram_id = ? AND jet_tap_units >= 100 RETURNING 1 AS exchanged`).bind(id).first();
  }

  const state = await db.prepare(`SELECT tokens, jet_tap_units AS jetiki,
    MAX(0, ${hourlySlot} + 3600 - ?1) AS nextRewardIn
    FROM users WHERE telegram_id = ?2`).bind(seconds, id).first();
  if (!state) return shopResponse({ ok: false, error: 'profile-not-found' }, 404);
  return shopResponse({ ok: true, ...state, rewardAmount: 50, ...change });
}

async function handleRoleEconomy(request, env, token) {
 const db = getD1(env);
 if (!db) return shopResponse({ok:false,error:'storage-unavailable'},503);
 const url = new URL(request.url);
 if (url.pathname === '/api/shop/roles' && request.method === 'GET') {
  const {results} = await db.prepare('SELECT * FROM shop_roles ORDER BY price,id').all();
  return shopResponse({ok:true,roles:results});
 }
 const opening = url.pathname === '/api/shop/open';
 const buying = url.pathname === '/api/shop/buy-role';
 const equipping = url.pathname === '/api/shop/active-role';
 const writes = buying || opening || equipping;
 if (request.method !== (writes ? 'POST' : 'GET')) return shopResponse({ok:false,error:'method-not-allowed'},405);
 if (writes && request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return shopResponse({ok:false,error:'origin-mismatch'},403);
 const body = writes ? await request.json().catch(()=>null) : {};
 if (!body) return shopResponse({ok:false,error:'invalid-json'},400);
 const id = await economyIdentity(request,token,body);
 if (!id) return shopResponse({ok:false,error:'telegram-auth'},401);
 const requested = body.telegram_id ?? url.searchParams.get('telegram_id');
 if (requested && String(requested)!==id) return shopResponse({ok:false,error:'identity-mismatch'},403);
 if (!await db.prepare('SELECT 1 FROM users WHERE telegram_id=?').bind(id).first()) return shopResponse({ok:false,error:'profile-not-found'},404);
 if (opening) {
  await db.prepare("INSERT OR IGNORE INTO web_achievement_events(telegram_id,event) VALUES(?,'explorer')").bind(id).run();
  return shopResponse({ok:true});
 }
 if (equipping) {
  const roleId = body.role_id;
  if (roleId !== null && (typeof roleId !== 'string' || !roleId || roleId.length > 80)) {
   return shopResponse({ok:false,error:'invalid-role'},400);
  }
  const updated = await db.prepare(`UPDATE users SET active_role_id = ?
    WHERE telegram_id = ? AND (? IS NULL OR EXISTS (
      SELECT 1 FROM user_roles WHERE telegram_id = users.telegram_id AND role_id = ?
    )) RETURNING active_role_id`).bind(roleId,id,roleId,roleId).first();
  if (!updated) return shopResponse({ok:false,error:'role-not-owned'},403);
  return shopResponse({ok:true,profile:await readProgressProfile(db,id)});
 }
 if (buying) {
  if(typeof body.role_id!=='string' || body.role_id.length>80) return shopResponse({ok:false,error:'invalid-role'},400);
  if(!await db.prepare('SELECT 1 FROM shop_roles WHERE id=?').bind(body.role_id).first()) return shopResponse({ok:false,error:'role-not-found'},404);
  try {
   // One SQLite statement and its triggers form one atomic transaction.
   await db.prepare('INSERT INTO user_roles(telegram_id,role_id) VALUES(?,?)').bind(id,body.role_id).run();
  } catch(error) {
   if(await db.prepare('SELECT 1 FROM user_roles WHERE telegram_id=? AND role_id=?').bind(id,body.role_id).first()) return shopResponse({ok:false,error:'already-owned'},409);
   if(String(error).includes('insufficient-funds')) return shopResponse({ok:false,error:'insufficient-funds'},409);
   throw error;
  }
 }
 const user=await db.prepare('SELECT * FROM users WHERE telegram_id=?').bind(id).first();
 const {results:roles}=await db.prepare('SELECT r.*,u.purchased_at FROM user_roles u JOIN shop_roles r ON r.id=u.role_id WHERE u.telegram_id=? ORDER BY r.price').bind(id).all();
 const {results:transactions}=await db.prepare('SELECT id,amount,type,description,created_at FROM transactions WHERE telegram_id=? ORDER BY id DESC LIMIT 50').bind(id).all();
 const {results:achievements} = await db.prepare(ROLE_ACHIEVEMENTS_SQL).bind(id).all();
 return shopResponse({ok:true,telegram_id:user.telegram_id,username:user.username,balance:user.tokens,
   active_role_id:user.active_role_id ?? null,roles,transactions,roleAchievements: achievements.map(row => row.achievement_id)});
}

const CATALOG_STATUSES = {
  in_stock: ['В наявності', 'In stock'],
  out_of_stock: ['Немає в наявності', 'Out of stock'],
  coming_soon: ['Скоро у продажу', 'Coming soon'],
};
const CATALOG_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PRODUCT_DETAILS_SQL = `json_set(p.details, '$.colorVariants', json((
  SELECT json_group_array(json(v.details) ORDER BY v.position)
  FROM product_variants v WHERE v.product_id=p.id
))) AS details`;
const PHOTO_PATH = /^\/api\/catalog\/photos\/([a-f0-9-]{36})$/;

async function saveCatalogProduct(request, db) {
  if (Number(request.headers.get('Content-Length')) > 19_000_000) {
    return shopResponse({ error: 'upload-too-large' }, 413);
  }
  const form = await request.formData().catch(() => null);
  const raw = form?.get('product');
  if (typeof raw !== 'string' || raw.length > 24_000) return shopResponse({ error: 'invalid-product' }, 400);
  const input = JSON.parse(raw);
  const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const id = clean(input?.id, 65);
  const titleUk = clean(input?.titleUk, 100);
  const statusType = input?.statusType;
  const price = input?.price;
  const variants = input?.colorVariants;
  const inStock = statusType === 'in_stock';
  if (!CATALOG_ID.test(id) || !titleUk || !Object.hasOwn(CATALOG_STATUSES, statusType)
      || (price === null ? inStock : !Number.isSafeInteger(price) || price < 1 || price > 1_000_000)
      || !Array.isArray(variants) || variants.length > 8) {
    return shopResponse({ error: 'invalid-product' }, 400);
  }
  const uploads = new Map();
  const owned = await db.prepare('SELECT id FROM catalog_photos WHERE product_id=?').bind(id).all();
  const ownIds = new Set(owned.results.map(photo => photo.id));
  async function gallery(sources, optional = false) {
    if (!Array.isArray(sources) || sources.length > 6 || (!optional && !sources.length)) throw new RangeError('invalid-gallery');
    const urls = [];
    for (const source of sources) {
      if (typeof source !== 'string' || source.length > 500) throw new RangeError('invalid-photo');
      if (source.startsWith('upload:')) {
        if (!uploads.has(source)) {
          const file = form.get(source);
          if (!(file instanceof File) || !file.size || file.size > 1_500_000 || uploads.size >= 12) {
            throw new RangeError('invalid-photo-size');
          }
          const content = await file.arrayBuffer();
          const b = new Uint8Array(content);
          const decoder = new TextDecoder();
          const mime = b[0] === 255 && b[1] === 216 && b[2] === 255 ? 'image/jpeg'
            : [137,80,78,71,13,10,26,10].every((byte, index) => b[index] === byte) ? 'image/png'
            : decoder.decode(b.slice(0, 4)) === 'RIFF' && decoder.decode(b.slice(8,12)) === 'WEBP' ? 'image/webp' : '';
          if (!mime) throw new RangeError('invalid-photo-type');
          const photoId = crypto.randomUUID();
          uploads.set(source, { id: photoId, mime, content });
        }
        urls.push('/api/catalog/photos/' + uploads.get(source).id);
        continue;
      }
      const photoId = source.match(PHOTO_PATH)?.[1];
      const localImage = /^\/(?!\/)[\w .%/()-]+\.(png|jpe?g|webp)$/i.test(source) && !source.includes('..') && !source.startsWith('/api/');
      if (!localImage && !(photoId && ownIds.has(photoId))) {
        throw new RangeError('invalid-photo');
      }
      urls.push(source);
    }
    return urls;
  }
  const photos = await gallery(input.gallery, variants.length > 0);
  const colorVariants = [];
  for (const variant of variants) {
    const variantId = clean(variant?.id, 65);
    const nameUk = clean(variant?.nameUk, 40);
    const colorCode = clean(variant?.colorCode, 8);
    if (!CATALOG_ID.test(variantId) || !nameUk || !/^#[0-9a-f]{6}$/i.test(colorCode)
        || colorVariants.some(color => color.id === variantId)) throw new RangeError('invalid-color');
    const images = await gallery(variant.photos);
    colorVariants.push({ id: variantId, nameUk, nameEn: clean(variant.nameEn, 40) || nameUk, colorCode, photos: images, image: images[0] });
  }
  const [statusBadgeUk, statusBadgeEn] = CATALOG_STATUSES[statusType];
  const product = {
    id, title: titleUk, titleUk, titleEn: clean(input.titleEn, 100) || titleUk, managed: true,
    categoryUk: clean(input.categoryUk, 80), categoryEn: clean(input.categoryEn, 80),
    descriptionUk: clean(input.descriptionUk, 1200), descriptionEn: clean(input.descriptionEn, 1200),
    price, priceUah: price === null ? undefined : String(price), gallery: photos,
    image: photos[0] || colorVariants[0].image, colorVariants,
    statusType, inStock, statusBadgeUk, statusBadgeEn,
    buttonTextUk: inStock ? 'Замовити' : statusBadgeUk, buttonTextEn: inStock ? 'Order' : statusBadgeEn,
    buttonAction: inStock ? 'order' : 'disabled',
  };
  const hidden = input.hidden === true;
  const { colorVariants: colors, ...details } = product;
  const insert = 'INSERT INTO products(id,details,hidden) VALUES(?,?,?)';
  const productWrite = input.create === true ? insert : insert
    + ' ON CONFLICT(id) DO UPDATE SET details=excluded.details,hidden=excluded.hidden';
  await db.batch([
    db.prepare(productWrite).bind(id, JSON.stringify(details), Number(hidden)),
    db.prepare('DELETE FROM product_variants WHERE product_id=?').bind(id),
    ...colors.map((color, position) => db.prepare('INSERT INTO product_variants(product_id,id,position,details) VALUES(?,?,?,?)')
      .bind(id, color.id, position, JSON.stringify(color))),
    ...[...uploads.values()].map(photo => db.prepare('INSERT INTO catalog_photos(id,product_id,mime,content) VALUES(?,?,?,?)')
      .bind(photo.id, id, photo.mime, photo.content)),
  ]);
  return shopResponse({ product: { ...product, hidden } });
}

async function changeCatalogStatus(request, db) {
  const input = await request.json();
  const { id, statusType } = input ?? {};
  if (typeof id !== 'string' || !CATALOG_ID.test(id) || !Object.hasOwn(CATALOG_STATUSES, statusType)) {
    return shopResponse({ error: 'invalid-status' }, 400);
  }
  const inStock = statusType === 'in_stock';
  const [labelUk, labelEn] = CATALOG_STATUSES[statusType];
  const result = await db.prepare(`UPDATE products SET details = json_set(details,
    '$.statusType', ?, '$.statusBadgeUk', ?, '$.statusBadgeEn', ?, '$.inStock', json(?),
    '$.buttonAction', ?, '$.buttonTextUk', ?, '$.buttonTextEn', ?, '$.managed', json('true'),
    '$.price', coalesce(json_extract(details,'$.price'),
      CASE WHEN ? THEN CAST(replace(json_extract(details,'$.priceUah'),' ','') AS INTEGER) END))
    WHERE id = ? AND (? = 0 OR coalesce(json_extract(details,'$.price'),
      CAST(replace(json_extract(details,'$.priceUah'),' ','') AS INTEGER)) > 0)
    RETURNING id`)
    .bind(statusType, labelUk, labelEn, String(inStock), inStock ? 'order' : 'disabled',
      inStock ? 'Замовити' : labelUk, inStock ? 'Order' : labelEn, Number(inStock), id, Number(inStock)).first();
  if (!result) {
    const exists = await db.prepare('SELECT id FROM products WHERE id=?').bind(id).first();
    return shopResponse({ error: exists ? 'price-required' : 'product-not-found' }, exists ? 409 : 404);
  }
  const row = await db.prepare('SELECT ' + PRODUCT_DETAILS_SQL + ',hidden FROM products p WHERE id=?').bind(id).first();
  return shopResponse({ product: { ...JSON.parse(row.details), hidden: Boolean(row.hidden) } });
}

const CATALOG_ADMIN_PATHS = ['/api/admin/products', '/api/catalog/admin'];

async function handleCatalog(request, env, pathname) {
  const admin = CATALOG_ADMIN_PATHS.includes(pathname);
  if (admin) {
    const secret = env?.BOT_TOKEN;
    const user = secret
      ? await verifyShopLaunch(request.headers.get('X-Telegram-Init-Data'), secret)
      : null;
    const id = user ? String(user.id) : secret
      ? await readProfileSession(request, secret) : null;
    if (id !== ADMIN_TELEGRAM_ID
        || (request.method !== 'GET' && request.headers.get('Origin') !== new URL(request.url).origin)) {
      return shopResponse({ error: 'forbidden' }, 403);
    }
  }
  const db = getD1(env);
  if (!db) return shopResponse({ error: 'catalog-unavailable' }, 503);
  try {
    if (admin && request.method === 'PUT') return await saveCatalogProduct(request, db);
    if (admin && request.method === 'PATCH') return await changeCatalogStatus(request, db);
    if (request.method !== 'GET') return shopResponse({ error: 'method-not-allowed' }, 405);
    if (pathname === '/api/catalog/subscribers') return shopResponse(await subscriberCount(db, env));
    if (pathname.startsWith('/api/catalog/photos/')) {
      const photo = await db.prepare(
        `SELECT mime,content FROM catalog_photos f JOIN products p ON p.id=f.product_id
        WHERE f.id=? AND p.hidden=0 AND (
          EXISTS (SELECT 1 FROM json_tree(p.details) WHERE value=?)
          OR EXISTS (SELECT 1 FROM product_variants v, json_tree(v.details) j WHERE v.product_id=p.id AND j.value=?)
        )`
      ).bind(pathname.match(PHOTO_PATH)?.[1] ?? '', pathname, pathname).first();
      return photo ? new Response(new Uint8Array(photo.content), { headers: {
        'Content-Type': photo.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      } }) : new Response(null, { status: 404 });
    }
    const { results } = await db.prepare(
      'SELECT ' + PRODUCT_DETAILS_SQL + ',hidden FROM products p' + (admin ? '' : ' WHERE hidden=0') + ' ORDER BY p.rowid'
    ).all();
    return shopResponse({
      ...(admin ? { isAdmin: true, telegram_id: ADMIN_TELEGRAM_ID } : {}),
      products: results.map(({ details, hidden }) => admin ? { ...JSON.parse(details), hidden: Boolean(hidden) } : JSON.parse(details)),
    });
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed: products.id')) return shopResponse({ error: 'product-exists' }, 409);
    if (error instanceof SyntaxError || error instanceof RangeError) return shopResponse({ error: error.message }, 400);
    return shopResponse({ error: 'catalog-unavailable' }, 503);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const token = env?.BOT_TOKEN;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (['/api/catalog', '/api/catalog/subscribers', ...CATALOG_ADMIN_PATHS].includes(url.pathname)
        || url.pathname.startsWith('/api/catalog/photos/')) {
      return handleCatalog(request, env, url.pathname);
    }

    if (['/api/shop/roles','/api/shop/buy-role','/api/user/profile','/api/shop/open','/api/shop/active-role'].includes(url.pathname)) {
      try { return await handleRoleEconomy(request,env,token); }
      catch { return shopResponse({ok:false,error:'economy-unavailable'},503); }
    }

    // 0. Публічна перевірка статусу технічних робіт (/api/maintenance)
    if (url.pathname === '/api/maintenance' && request.method === 'GET') {
      const maintenanceMode = await getMaintenanceState(env);
      return new Response(JSON.stringify({ ok: true, maintenanceMode, adminId: ADMIN_TELEGRAM_ID }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    if (url.pathname === '/api/profile' && ['GET', 'POST'].includes(request.method)) {
      try {
        return await handleProfile(request, env, token);
      } catch (error) {
        console.error('Profile request failed:', error);
        return shopResponse({ ok: false, error: 'profile-unavailable' }, 503);
      }
    }

    if (url.pathname === '/api/terms' && request.method === 'POST') {
      try {
        return await recordTerms(request, env, token);
      } catch {
        return shopResponse({ ok: false, error: 'terms-storage-unavailable' }, 503);
      }
    }

    if (url.pathname === '/api/profile/shop' && request.method === 'POST') {
      try {
        return await handleProfileShop(request, env, token);
      } catch {
        return shopResponse({ ok: false, error: 'unavailable' }, 503);
      }
    }

    if (url.pathname === '/api/order' && request.method === 'POST') {
      return handleShopOrder(request, env, token);
    }

    // 2.5. JET транзакції (/api/jet/transactions)
    if (url.pathname === '/api/jet/transactions' && request.method === 'GET') {
      try {
        const telegramId = await economyIdentity(request, token);
        if (!telegramId || (url.searchParams.get('id') && url.searchParams.get('id') !== telegramId)) return shopResponse({ok:false,error:'telegram-auth'},401);
        if (!telegramId) {
          return new Response(JSON.stringify({ ok: false, error: 'Missing id' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }
        const db = getD1(env);
        let transactions = [];
        if (db) {
          await ensureD1Schema(db);
          const res = await db
            .prepare(`SELECT * FROM jet_transactions WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 20`)
            .bind(telegramId)
            .all();
          transactions = res?.results || [];
        }
        return new Response(JSON.stringify({ ok: true, transactions }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }
    }

    if (['/api/jet/heartbeat', '/api/jet/activity-reward', '/api/jet/tap', '/api/jet/exchange'].includes(url.pathname) && request.method === 'POST') {
      try {
        return await handleJetActivity(request, env, token);
      } catch {
        return shopResponse({ ok: false, error: 'activity-unavailable' }, 503);
      }
    }

    // 2.68. Таблиця лідерів за жетонами JET (/api/leaderboard)
    // СУВОРЕ ПРАВИЛО: виключаємо адмінів 5905168657 (засновник) та 7499154793 (Саша)
    if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
      try {
        const db = getD1(env);
        let leaderboard = [];
        if (db) {
          await ensureD1Schema(db);
          await syncAchievementXP(db);
          const res = await db
            .prepare(
              `SELECT telegram_id, username, first_name, last_name, photo_url, tokens, roles, tags, level, xp, rewards, created_at, jet_peak,
                      profile_frame_id, profile_frame_color, ${SHOP_ROLES_SQL}, ${FOUNDER_STATUS_SQL}, ${WEB_REWARDS_SQL}
               FROM users
               WHERE telegram_id NOT IN ('5905168657', '7499154793')
               ORDER BY tokens DESC, xp DESC, telegram_id ASC
               LIMIT 50`
            )
            .all();
          leaderboard = (res?.results || []).map((row, idx) => {
            const profile = mapRowToProfile(row);
            return {
              rank: idx + 1,
              id: profile.id,
              firstName: profile.firstName,
              lastName: profile.lastName,
              username: profile.username,
              photoUrl: profile.photoUrl,
              tokens: profile.tokens,
              roles: profile.roles,
              tags: row.tags,
              rewards: profile.rewards,
              level: profile.level,
              xp: profile.xp,
              frameId: profile.frameId,
              frameColor: profile.frameColor,
            };
          });
        }
        return new Response(JSON.stringify({ ok: true, leaderboard }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }
    }

    // 2.7. Реєстрація реферала (/api/referral/register)
    if (url.pathname === '/api/referral/register' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const userId = await economyIdentity(request,token,body);
        if (!userId || (body.userId && String(body.userId)!==userId)) return shopResponse({ok:false,error:'telegram-auth'},401);
        const referrerId = String(body?.referrerId || '').trim();
        if (!userId || !referrerId) {
          return new Response(JSON.stringify({ ok: false, error: 'Missing userId or referrerId' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }
        if (userId === referrerId) {
          return new Response(JSON.stringify({ ok: false, error: 'Cannot refer yourself' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }
        const db = getD1(env);
        if (!db) {
          return new Response(JSON.stringify({ ok: false, error: 'DB unavailable' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }
        await ensureD1Schema(db);
        const userRow = await db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).bind(userId).first();
        if (!userRow) {
          return new Response(JSON.stringify({ ok: false, error: 'User not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }
        if (userRow.referred_by && userRow.referred_by !== '') {
          return new Response(JSON.stringify({ ok: false, error: 'User already has a referrer' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }
        // Set referred_by and grant bonuses
        const registered = await db.prepare(`UPDATE users SET referred_by = ? WHERE telegram_id = ? AND COALESCE(referred_by,'')='' AND EXISTS(SELECT 1 FROM users WHERE telegram_id=?) RETURNING telegram_id`).bind(referrerId,userId,referrerId).first();
        if(!registered) return shopResponse({ok:false,error:'referral-already-registered-or-missing'},409);
        await db.prepare(`UPDATE users SET tokens = tokens + 100 WHERE telegram_id = ?`).bind(userId).run();
        await insertJetTransaction(db, userId, 100, 'Реферальний бонус — запрошений (+100 JET)');
        const refRow = await db.prepare(`SELECT tokens FROM users WHERE telegram_id = ?`).bind(referrerId).first();
        if (refRow) {
          await db.prepare(`UPDATE users SET tokens = tokens + 100 WHERE telegram_id = ?`).bind(referrerId).run();
          await insertJetTransaction(db, referrerId, 100, 'Реферальний бонус — запросив друга (+100 JET)');
        }
        return new Response(JSON.stringify({ ok: true, bonusGranted: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }
    }

    // 3. ЗАХИЩЕНІ СЕРВЕРНІ ЕНДПОІНТИ АДМІНІСТРАТОРА (/api/admin/*)
    // Вимагають криптографічного підпису Telegram initData (user.id === 5905168657) або серверного ключа X-Admin-Key
    if (url.pathname.startsWith('/api/admin/')) {
      try {
        let bodyData = null;
        if (request.method === 'POST' || request.method === 'PUT') {
          bodyData = await request.json().catch(() => ({}));
        }

        const isAuthorized = await isAuthorizedAdminRequest(request, bodyData, env);
        if (!isAuthorized) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: 'Forbidden: Valid server admin key or signed Telegram initData for ID 5905168657 required',
            }),
            {
              status: 403,
              headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            }
          );
        }

        const db = getD1(env);
        if (db) {
          await ensureD1Schema(db);
        }

        // 3.1. Список усіх зареєстрованих користувачів із D1
        if (url.pathname === '/api/admin/users' && request.method === 'GET') {
          const maintenanceMode = await getMaintenanceState(env);
          let usersList = [];

          if (db) {
            const res = await db
              .prepare(
                `SELECT * FROM users
                 ORDER BY CASE WHEN telegram_id = ? THEN 0 ELSE 1 END, datetime(created_at) DESC`
              )
              .bind(ADMIN_TELEGRAM_ID)
              .all();
            usersList = (res?.results || []).map(mapRowToProfile).filter(Boolean);
          } else {
            usersList = Array.from(MEMORY_USERS.values());
          }

          return new Response(
            JSON.stringify({
              ok: true,
              users: usersList,
              maintenanceMode,
              totalUsers: usersList.length,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            }
          );
        }

        // 3.2. Серверне оновлення балансу JET, ролей, рівня, XP та ачівок у D1
        if (url.pathname === '/api/admin/update-user' && request.method === 'POST') {
          const updatedProfile = await updateUserRecordServerSide(env, bodyData);
          if (!updatedProfile) {
            return new Response(JSON.stringify({ ok: false, error: 'Failed to update user in D1' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            });
          }

          return new Response(JSON.stringify({ ok: true, profile: updatedProfile }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }

        // 3.3. Перемикання режиму «Технічні роботи»
        if (url.pathname === '/api/admin/maintenance' && request.method === 'POST') {
          const nextState = await setMaintenanceState(env, Boolean(bodyData?.enabled));
          return new Response(JSON.stringify({ ok: true, maintenanceMode: nextState }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }
    }

    // 4. Telegram-вебхук (/api/telegram або /webhook) + СЕРВЕРНЕ КЕРУВАННЯ БАЗОЮ D1 ДЛЯ АДМІНА 5905168657
    if ((url.pathname === '/api/telegram' || url.pathname === '/webhook') && request.method === 'POST') {
      if (!env?.TELEGRAM_WEBHOOK_SECRET || !token) return shopResponse({ok:false,error:'webhook-unconfigured'},503);
      if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) {
        return shopResponse({ok:false,error:'webhook-forbidden'},403);
      }
      try {
        const update = await request.json();
        const message = update?.message;
        const text = message?.text?.trim() || '';
        const chatId = message?.chat?.id;
        const fromUser = message?.from;

        const parts = text.split(/\s+/);
        const cmd = parts[0]?.toLowerCase().split('@')[0] || '';

        if (fromUser && fromUser.id && !fromUser.is_bot) {
          await upsertUserInD1(env, fromUser).catch(() => {});
        }

        const isCallerAdmin = String(fromUser?.id || '') === ADMIN_TELEGRAM_ID;

        // Серверні команди адміністратора (доступні виключно для Telegram ID 5905168657 прямо в боті)
        if (chatId && isCallerAdmin && text.startsWith('/')) {

          if (cmd === '/admin' || cmd === '/help_admin') {
            const helpMsg = [
              `🛡 СЕРВЕРНЕ КЕРУВАННЯ CLOUDFLARE D1 (ID: ${ADMIN_TELEGRAM_ID})`,
              ``,
              `• /users — список усіх зареєстрованих користувачів, їх баланси JET, ролі та дати`,
              `• /user <id> — детальна картка користувача з бази D1`,
              `• /setjet <id> <сума> — встановити точний баланс монеток JET`,
              `• /addjet <id> <число> — нарахувати або списати монетки JET (напр. /addjet 5905168657 500)`,
              `• /setrole <id> <ролі> — присвоїти ролі Discord через кому`,
              `• /setlvl <id> <lvl> [xp] — встановити рівень та XP`,
              `• /give <id> <id_ачівки | all | reset> — видати ачівку або всі ${ALL_ACHIEVEMENT_IDS.length} ачівок`,
              `• /maintenance <on | off> — увімкнути або вимкнути технічні роботи`,
            ].join('\n');
            await sendTelegramMessage(token, chatId, helpMsg);
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (cmd === '/users') {
            const db = getD1(env);
            if (db) {
              await ensureD1Schema(db);
              const res = await db
                .prepare(`SELECT * FROM users ORDER BY datetime(created_at) DESC LIMIT 50`)
                .all();
              const rows = (res?.results || []).map(mapRowToProfile).filter(Boolean);
              const lines = [
                `📊 КОРИСТУВАЧІ В БАЗІ CLOUDFLARE D1 (${rows.length}):`,
                ``,
                ...rows.map((u, idx) => {
                  const uname = u.username ? `@${u.username}` : 'без @username';
                  const regDate = String(u.createdAt || '').slice(0, 16).replace('T', ' ');
                  const loginDate = String(u.lastLoginAt || '').slice(0, 16).replace('T', ' ');
                  return `${idx + 1}. ${u.firstName} ${u.lastName || ''} (${uname})\n   ID: ${u.id} | 💰 ${u.tokens} JET | LVL ${u.level} (${u.xp} XP)\n   Ролі: ${u.roles}\n   Реєстрація: ${regDate} | Вхід: ${loginDate}`;
                }),
              ];
              await sendTelegramMessage(token, chatId, lines.join('\n\n'));
            }
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (cmd === '/user' && parts[1]) {
            const targetId = parts[1].trim();
            const db = getD1(env);
            if (db) {
              await ensureD1Schema(db);
              const row = await db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).bind(targetId).first();
              const u = mapRowToProfile(row);
              if (!u) {
                await sendTelegramMessage(token, chatId, `❌ Користувача з ID ${targetId} не знайдено в D1.`);
              } else {
                const info = [
                  `👤 КАРТКА КОРИСТУВАЧА D1`,
                  `• Telegram ID: ${u.id}`,
                  `• Ім'я: ${u.firstName} ${u.lastName || ''}`,
                  `• Username: ${u.username ? '@' + u.username : '—'}`,
                  `• Баланс: ${u.tokens} JET`,
                  `• Рівень: LVL ${u.level} (${u.xp} XP)`,
                  `• Ролі: ${u.roles}`,
                  `• Ачівки (${u.rewards.length}/${ALL_ACHIEVEMENT_IDS.length}): ${u.rewards.join(', ')}`,
                  `• Перший вхід: ${u.createdAt}`,
                  `• Останній вхід: ${u.lastLoginAt}`,
                ].join('\n');
                await sendTelegramMessage(token, chatId, info);
              }
            }
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if ((cmd === '/setjet' || cmd === '/addjet') && parts[1] && parts[2] !== undefined) {
            const targetId = parts[1].trim();
            const amount = Number(parts[2]);
            if (!Number.isNaN(amount)) {
              const updated = await updateUserRecordServerSide(
                env,
                cmd === '/setjet' ? { targetId, tokens: amount } : { targetId, deltaTokens: amount }
              );
              if (updated) {
                await sendTelegramMessage(
                  token,
                  chatId,
                  `✅ Баланс користувача ${updated.firstName} (ID: ${updated.id}) оновлено в D1: ${updated.tokens} JET`
                );
              }
            }
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (cmd === '/setrole' && parts[1] && parts.length >= 3) {
            const targetId = parts[1].trim();
            const rolesStr = text.replace(/^\/setrole(@\S+)?\s+\S+\s+/i, '').trim();
            if (rolesStr) {
              const updated = await updateUserRecordServerSide(env, { targetId, roles: rolesStr, tags: rolesStr });
              if (updated) {
                await sendTelegramMessage(
                  token,
                  chatId,
                  `✅ Ролі користувача ${updated.firstName} (ID: ${updated.id}) оновлено в D1:\n${updated.roles}`
                );
              }
            }
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (cmd === '/setlvl' && parts[1] && parts[2] !== undefined) {
            const targetId = parts[1].trim();
            const lvl = Number(parts[2]);
            const xp = parts[3] !== undefined ? Number(parts[3]) : undefined;
            if (!Number.isNaN(lvl)) {
              const updated = await updateUserRecordServerSide(env, {
                targetId,
                level: lvl,
                ...(xp !== undefined && !Number.isNaN(xp) ? { xp } : {}),
              });
              if (updated) {
                await sendTelegramMessage(
                  token,
                  chatId,
                  `✅ Рівень користувача ${updated.firstName} (ID: ${updated.id}) оновлено в D1: LVL ${updated.level} · ${updated.xp} XP`
                );
              }
            }
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (cmd === '/give' && parts[1] && parts[2]) {
            const targetId = parts[1].trim();
            const achArg = parts[2].trim().toLowerCase();
            const db = getD1(env);
            if (db) {
              await ensureD1Schema(db);
              const existing = await db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).bind(targetId).first();
              const currentRewards = parseRewardsArray(existing?.rewards);
              let nextRewards = currentRewards;
              if (achArg === 'all') {
                nextRewards = [...ALL_ACHIEVEMENT_IDS];
              } else if (achArg === 'reset') {
                nextRewards = ['early-rider'];
              } else if (!currentRewards.includes(achArg)) {
                nextRewards = [...currentRewards, achArg];
              }
              const updated = await updateUserRecordServerSide(env, { targetId, rewards: nextRewards });
              if (updated) {
                await sendTelegramMessage(
                  token,
                  chatId,
                  `✅ Ачівки користувача ${updated.firstName} (ID: ${updated.id}) оновлено в D1 (${updated.rewards.length}/${ALL_ACHIEVEMENT_IDS.length}).`
                );
              }
            }
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          if (cmd === '/maintenance' && parts[1]) {
            const arg = parts[1].trim().toLowerCase();
            const enable = arg === 'on' || arg === '1' || arg === 'true';
            const state = await setMaintenanceState(env, enable);
            await sendTelegramMessage(
              token,
              chatId,
              state
                ? `🔒 Режим технічних робіт УВІМКНЕНО в D1 (сайт доступний тільки для ID ${ADMIN_TELEGRAM_ID}).`
                : `🟢 Режим технічних робіт ВИМКНЕНО в D1 (сайт відкритий для всіх).`
            );
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          }
        }

        // /ref command — available to all users, sends personal referral link
        if (chatId && fromUser && (cmd === '/ref' || text === '/ref')) {
          const refUserId = String(fromUser.id || '');
          const refLink = `https://t.me/Alexov_Shop_bot?start=ref_${refUserId}`;
          await sendTelegramMessage(
            token,
            chatId,
            `Реферальне посилання:\n${refLink}\n\nЗапрошуйте друзів та отримуйте по +100 JET за кожного користувача.`
          );
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (chatId && (text === '/start' || text.startsWith('/start '))) {
          // If started with ref parameter (/start ref_<referrerId>)
          if (text.startsWith('/start ref_') && fromUser && fromUser.id) {
            const referrerId = text.replace('/start ref_', '').trim();
            const userId = String(fromUser.id);
            if (referrerId && referrerId !== userId) {
              const db = getD1(env);
              if (db) {
                try {
                  await ensureD1Schema(db);
                  const userRow = await db.prepare(`SELECT referred_by FROM users WHERE telegram_id = ?`).bind(userId).first();
                  if (userRow && (!userRow.referred_by || userRow.referred_by === '')) {
                    await db.prepare(`UPDATE users SET referred_by = ? WHERE telegram_id = ?`).bind(referrerId, userId).run();
                    await db.prepare(`UPDATE users SET tokens = tokens + 100 WHERE telegram_id = ?`).bind(userId).run();
                    await insertJetTransaction(db, userId, 100, 'Реферальний бонус — запрошений (+100 JET)');
                    const refCurrent = await db.prepare(`SELECT tokens FROM users WHERE telegram_id = ?`).bind(referrerId).first();
                    if (refCurrent) {
                      await db.prepare(`UPDATE users SET tokens = tokens + 100 WHERE telegram_id = ?`).bind(referrerId).run();
                      await insertJetTransaction(db, referrerId, 100, 'Реферальний бонус — запросив друга (+100 JET)');
                      await sendTelegramMessage(token, referrerId, `Користувач зареєструвався за вашим реферальним посиланням. Нараховано +100 JET.`).catch(() => {});
                    }
                  }
                } catch {}
              }
            }
          }

          const origin = url.origin;
          const bannerUrl = `${origin.replace(/\/$/, '')}/banner.JPG`;

          const startCaption = [
            'ALEXOV SHOP',
            'Офіційний магазин мерчу та екіпірування Alexov Street Team.',
            '',
            'Каталог товарів, актуальний баланс JET та оформлення замовлень доступні у застосунку.'
          ].join('\n');

          const replyMarkup = {
            inline_keyboard: [
              [
                {
                  text: 'Відкрити магазин',
                  web_app: { url: origin },
                },
              ],
              [
                {
                  text: 'Офіційний канал',
                  url: 'https://t.me/Alexov_Street_Team',
                },
                {
                  text: 'Менеджер',
                  url: 'https://t.me/Alexov_Manager',
                },
              ],
            ],
          };

          const photoRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              photo: bannerUrl,
              caption: startCaption,
              reply_markup: replyMarkup,
            }),
          });

          if (!photoRes.ok) {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: startCaption,
                reply_markup: replyMarkup,
              }),
            });
          }
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 5. Роздача статичних файлів сайту (Astro build у папці public)
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return fetch(request);
  },
};
