/**
 * Система Discord-ролей (тегів) та каталог досягнень (ачівок) для Alexov Shop.
 * Усі ролі та досягнення виконані у витриманій райдерській тематиці українською мовою.
 */

export interface DiscordRolePreset {
  id: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  glow?: string;
  icon?: string;
  dotColor: string;
}

export const DISCORD_ROLE_PRESETS: DiscordRolePreset[] = [

  {
    id: 'founder',
    label: '† FOUNDER †',
    color: '#fda4af',
    bg: 'rgba(244, 63, 94, 0.16)',
    border: 'rgba(244, 63, 94, 0.55)',
    glow: '0 0 14px rgba(244, 63, 94, 0.38)',
    dotColor: '#f43f5e',
  },
  {
    id: 'admin',
    label: 'ADMIN',
    color: '#f87171',
    bg: 'rgba(239, 68, 68, 0.16)',
    border: 'rgba(239, 68, 68, 0.52)',
    glow: '0 0 12px rgba(239, 68, 68, 0.3)',
    dotColor: '#ef4444',
  },
  {
    id: 'stunt-rider',
    label: 'STUNT RIDER',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.16)',
    border: 'rgba(56, 189, 248, 0.5)',
    glow: '0 0 12px rgba(56, 189, 248, 0.28)',
    dotColor: '#0284c7',
  },
  {
    id: 'surron-rider',
    label: 'SUR-RON RIDER',
    color: '#fb923c',
    bg: 'rgba(249, 115, 22, 0.16)',
    border: 'rgba(249, 115, 22, 0.5)',
    glow: '0 0 12px rgba(249, 115, 22, 0.26)',
    dotColor: '#ea580c',
  },
  {
    id: 'electro-rider',
    label: 'ELECTRO RIDER',
    color: '#a3e635',
    bg: 'rgba(132, 204, 22, 0.16)',
    border: 'rgba(132, 204, 22, 0.5)',
    glow: '0 0 12px rgba(132, 204, 22, 0.26)',
    dotColor: '#84cc16',
  },
  {
    id: 'vip-rider',
    label: 'VIP RIDER',
    color: '#fde047',
    bg: 'rgba(234, 179, 8, 0.16)',
    border: 'rgba(234, 179, 8, 0.5)',
    glow: '0 0 12px rgba(234, 179, 8, 0.28)',
    dotColor: '#eab308',
  },
  {
    id: 'og-rider',
    label: 'OG RIDER',
    color: '#6ee7b7',
    bg: 'rgba(16, 185, 129, 0.16)',
    border: 'rgba(16, 185, 129, 0.5)',
    glow: '0 0 10px rgba(16, 185, 129, 0.22)',
    dotColor: '#10b981',
  },
  {
    id: 'rider',
    label: 'RIDER',
    color: '#e2e8f0',
    bg: 'rgba(148, 163, 184, 0.14)',
    border: 'rgba(148, 163, 184, 0.42)',
    dotColor: '#94a3b8',
  },
];

export function resolveDiscordRoleStyle(rawLabel: string): DiscordRolePreset {
  const normalized = rawLabel.trim().toUpperCase();
  const found = DISCORD_ROLE_PRESETS.find((r) => r.label.toUpperCase() === normalized);
  if (found) return found;

  if (normalized.includes('FOUNDER')) {
    return { ...DISCORD_ROLE_PRESETS.find(role => role.id === 'founder')!, label: rawLabel.trim() };
  }
  if (normalized.includes('ADMIN')) {
    return { ...DISCORD_ROLE_PRESETS.find(role => role.id === 'admin')!, label: rawLabel.trim() };
  }
  if (normalized.includes('STUNT')) {
    return { ...DISCORD_ROLE_PRESETS.find(role => role.id === 'stunt-rider')!, label: rawLabel.trim() };
  }
  if (normalized.includes('SUR-RON') || normalized.includes('SURRON')) {
    return { ...DISCORD_ROLE_PRESETS.find(role => role.id === 'surron-rider')!, label: rawLabel.trim() };
  }
  if (normalized.includes('ELECTRO') || normalized.includes('SHTORM')) {
    return { ...DISCORD_ROLE_PRESETS.find(role => role.id === 'electro-rider')!, label: rawLabel.trim() };
  }
  if (normalized.includes('VIP')) {
    return { ...DISCORD_ROLE_PRESETS.find(role => role.id === 'vip-rider')!, label: rawLabel.trim() };
  }
  if (normalized.includes('OG')) {
    return { ...DISCORD_ROLE_PRESETS[6], label: rawLabel.trim() };
  }

  return {
    id: 'rider',
    label: rawLabel.trim() || 'RIDER',
    color: '#e2e8f0',
    bg: 'rgba(148, 163, 184, 0.14)',
    border: 'rgba(148, 163, 184, 0.42)',
    dotColor: '#94a3b8',
  };
}

export function parseTagsList(tagsStr?: string): string[] {
  if (!tagsStr) return ['RIDER'];
  const parts = String(tagsStr)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : ['RIDER'];
}

export interface AchievementDef {
  id: string;
  icon: string;
  titleUk: string;
  titleEn: string;
  descUk: string;
  descEn: string;
  rarity: 'mythic' | 'legendary' | 'epic' | 'rare';
  days?: number;
  jet?: number;
}

/**
 * Каталог досягнень Alexov Shop.
 * Включає офіційну лінійку за часом перебування у проєкті (вислуга) + райдерські нагороди.
 */
const WEB_MILESTONES: AchievementDef[] = [
  {
    id: 'tenure-1d',
    icon: '☀️',
    titleUk: '1 день у проєкті',
    titleEn: '1 Day in Project',
    descUk: 'Проведи 1 день у проєкті.',
    descEn: 'Spend 1 day in the project.',
    rarity: 'rare',
    days: 1,
  },
  {
    id: 'tenure-14d',
    icon: '🗓️',
    titleUk: '2 тижні у проєкті',
    titleEn: '2 Weeks in Project',
    descUk: 'Проведи 14 днів у проєкті.',
    descEn: 'Spend 14 days in the project.',
    rarity: 'rare',
    days: 14,
  },
  {
    id: 'tenure-3m',
    icon: '🏁',
    titleUk: '3 місяці у проєкті',
    titleEn: '3 Months in Project',
    descUk: 'Проведи 90 днів у проєкті.',
    descEn: 'Spend 90 days in the project.',
    rarity: 'epic',
    days: 90,
  },
  {
    id: 'jet-rookie',
    icon: '⚡',
    titleUk: 'Новачок',
    titleEn: 'Rookie',
    descUk: 'Досягни балансу 100 JET.',
    descEn: 'Reach a balance of 100 JET.',
    rarity: 'rare',
    jet: 100,
  },
  {
    id: 'jet-saver',
    icon: '🪙',
    titleUk: 'Перші накопичення',
    titleEn: 'First Savings',
    descUk: 'Досягни балансу 150 JET.',
    descEn: 'Reach a balance of 150 JET.',
    rarity: 'rare',
    jet: 150,
  },
  {
    id: 'jet-magnate',
    icon: '💎',
    titleUk: 'Магнат',
    titleEn: 'Magnate',
    descUk: 'Досягни балансу 500 JET.',
    descEn: 'Reach a balance of 500 JET.',
    rarity: 'legendary',
    jet: 500,
  },
  {
    id: 'jet-whale-1000',
    icon: '🐋',
    titleUk: 'Кит',
    titleEn: 'Whale',
    descUk: 'Досягни балансу 1000 JET.',
    descEn: 'Reach a balance of 1000 JET.',
    rarity: 'legendary',
    jet: 1000,
  },
  {
    id: 'tenure-7d',
    icon: '🗓️',
    titleUk: '7 днів у команді',
    titleEn: '7 Days in Team',
    descUk: 'Проведи 7 днів у проєкті.',
    descEn: 'Spend 7 days in the project.',
    days: 7,
    rarity: 'rare',
  },
  {
    id: 'tenure-1m',
    icon: '🛡️',
    titleUk: '1 місяць у спільноті',
    titleEn: '1 Month in Community',
    descUk: 'Проведи 30 днів у проєкті.',
    descEn: 'Spend 30 days in the project.',
    days: 30,
    rarity: 'epic',
  },
  {
    id: 'tenure-6m',
    icon: '💎',
    titleUk: 'Пів року з нами',
    titleEn: '6 Months with Us',
    descUk: 'Проведи 180 днів у проєкті.',
    descEn: 'Spend 180 days in the project.',
    days: 180,
    rarity: 'legendary',
  },
  {
    id: 'tenure-1y',
    icon: '👑',
    titleUk: '1 рік у строю',
    titleEn: '1 Year in Service',
    descUk: 'Проведи 365 днів у проєкті.',
    descEn: 'Spend 365 days in the project.',
    days: 365,
    rarity: 'mythic',
  },
  {
    id: 'founder-50',
    icon: '🏅',
    titleUk: 'Перші 50 / OG Rider',
    titleEn: 'First 50 / OG Rider',
    descUk: 'Ексклюзивна відзнака перших 50 учасників Alexov Shop. Навічно.',
    descEn: 'Exclusive badge for the first 50 members of Alexov Shop. Forever.',
    rarity: 'mythic',
  },
];

export const ACHIEVEMENTS_CATALOG: AchievementDef[] = [
 {id:'first-visit',icon:'↗',titleUk:'Перший візит',titleEn:'First Visit',descUk:'Увійдіть на сайт через Telegram.',descEn:'Sign in to the website with Telegram.',rarity:'rare'},
 {id:'explorer',icon:'◈',titleUk:'Дослідник',titleEn:'Explorer',descUk:'Відкрийте магазин ролей.',descEn:'Open the role shop.',rarity:'rare'},
 {id:'first-order',icon:'▣',titleUk:'Перше замовлення',titleEn:'First Order',descUk:'Оформіть замовлення після входу через Telegram.',descEn:'Place an order while signed in with Telegram.',rarity:'epic'},
 {id:'collector',icon:'✦',titleUk:'Колекціонер',titleEn:'Collector',descUk:'Придбайте першу роль за JET.',descEn:'Purchase your first role with JET.',rarity:'epic'},
 {id:'role-collector-5',icon:'◈',titleUk:'Колекціонер ролей',titleEn:'Role Collector',descUk:'Придбайте 5 різних ролей.',descEn:'Buy 5 distinct roles.',rarity:'epic'},
 {id:'role-club-elite',icon:'♛',titleUk:'Еліта клубу',titleEn:'Club Elite',descUk:'Придбайте 3 ролі вартістю від 5000 JET кожна.',descEn:'Buy 3 roles priced at 5000 JET or more each.',rarity:'legendary'},
 {id:'role-magnate',icon:'Ω',titleUk:'Магнат ролей',titleEn:'Role Magnate',descUk:'Придбайте OMEGA RELIC.',descEn:'Buy OMEGA RELIC.',rarity:'mythic'},
 ...WEB_MILESTONES,
{"id":"tenure-extra-2","icon":"◷","titleUk":"2 днів разом","titleEn":"2 days together","descUk":"Проведи 2 днів у проєкті.","descEn":"Spend 2 days in the project.","days":2,"rarity":"epic"},
{"id":"tenure-extra-3","icon":"◷","titleUk":"3 днів разом","titleEn":"3 days together","descUk":"Проведи 3 днів у проєкті.","descEn":"Spend 3 days in the project.","days":3,"rarity":"epic"},
{"id":"tenure-extra-5","icon":"◷","titleUk":"5 днів разом","titleEn":"5 days together","descUk":"Проведи 5 днів у проєкті.","descEn":"Spend 5 days in the project.","days":5,"rarity":"epic"},
{"id":"tenure-extra-10","icon":"◷","titleUk":"10 днів разом","titleEn":"10 days together","descUk":"Проведи 10 днів у проєкті.","descEn":"Spend 10 days in the project.","days":10,"rarity":"epic"},
{"id":"tenure-extra-21","icon":"◷","titleUk":"21 днів разом","titleEn":"21 days together","descUk":"Проведи 21 днів у проєкті.","descEn":"Spend 21 days in the project.","days":21,"rarity":"epic"},
{"id":"tenure-extra-45","icon":"◷","titleUk":"45 днів разом","titleEn":"45 days together","descUk":"Проведи 45 днів у проєкті.","descEn":"Spend 45 days in the project.","days":45,"rarity":"epic"},
{"id":"tenure-extra-60","icon":"◷","titleUk":"60 днів разом","titleEn":"60 days together","descUk":"Проведи 60 днів у проєкті.","descEn":"Spend 60 days in the project.","days":60,"rarity":"epic"},
{"id":"tenure-extra-120","icon":"◷","titleUk":"120 днів разом","titleEn":"120 days together","descUk":"Проведи 120 днів у проєкті.","descEn":"Spend 120 days in the project.","days":120,"rarity":"epic"},
{"id":"tenure-extra-150","icon":"◷","titleUk":"150 днів разом","titleEn":"150 days together","descUk":"Проведи 150 днів у проєкті.","descEn":"Spend 150 days in the project.","days":150,"rarity":"epic"},
{"id":"tenure-extra-210","icon":"◷","titleUk":"210 днів разом","titleEn":"210 days together","descUk":"Проведи 210 днів у проєкті.","descEn":"Spend 210 days in the project.","days":210,"rarity":"epic"},
{"id":"tenure-extra-240","icon":"◷","titleUk":"240 днів разом","titleEn":"240 days together","descUk":"Проведи 240 днів у проєкті.","descEn":"Spend 240 days in the project.","days":240,"rarity":"epic"},
{"id":"tenure-extra-270","icon":"◷","titleUk":"270 днів разом","titleEn":"270 days together","descUk":"Проведи 270 днів у проєкті.","descEn":"Spend 270 days in the project.","days":270,"rarity":"epic"},
{"id":"tenure-extra-300","icon":"◷","titleUk":"300 днів разом","titleEn":"300 days together","descUk":"Проведи 300 днів у проєкті.","descEn":"Spend 300 days in the project.","days":300,"rarity":"epic"},
{"id":"tenure-extra-400","icon":"◷","titleUk":"400 днів разом","titleEn":"400 days together","descUk":"Проведи 400 днів у проєкті.","descEn":"Spend 400 days in the project.","days":400,"rarity":"epic"},
{"id":"tenure-extra-500","icon":"◷","titleUk":"500 днів разом","titleEn":"500 days together","descUk":"Проведи 500 днів у проєкті.","descEn":"Spend 500 days in the project.","days":500,"rarity":"epic"},
{"id":"tenure-extra-600","icon":"◷","titleUk":"600 днів разом","titleEn":"600 days together","descUk":"Проведи 600 днів у проєкті.","descEn":"Spend 600 days in the project.","days":600,"rarity":"epic"},
{"id":"tenure-extra-730","icon":"◷","titleUk":"730 днів разом","titleEn":"730 days together","descUk":"Проведи 730 днів у проєкті.","descEn":"Spend 730 days in the project.","days":730,"rarity":"epic"},
{"id":"jet-extra-200","icon":"◈","titleUk":"Резерв 200 JET","titleEn":"200 JET reserve","descUk":"Досягни балансу 200 JET.","descEn":"Reach a balance of 200 JET.","jet":200,"rarity":"legendary"},
{"id":"jet-extra-250","icon":"◈","titleUk":"Резерв 250 JET","titleEn":"250 JET reserve","descUk":"Досягни балансу 250 JET.","descEn":"Reach a balance of 250 JET.","jet":250,"rarity":"legendary"},
{"id":"jet-extra-300","icon":"◈","titleUk":"Резерв 300 JET","titleEn":"300 JET reserve","descUk":"Досягни балансу 300 JET.","descEn":"Reach a balance of 300 JET.","jet":300,"rarity":"legendary"},
{"id":"jet-extra-400","icon":"◈","titleUk":"Резерв 400 JET","titleEn":"400 JET reserve","descUk":"Досягни балансу 400 JET.","descEn":"Reach a balance of 400 JET.","jet":400,"rarity":"legendary"},
{"id":"jet-extra-600","icon":"◈","titleUk":"Резерв 600 JET","titleEn":"600 JET reserve","descUk":"Досягни балансу 600 JET.","descEn":"Reach a balance of 600 JET.","jet":600,"rarity":"legendary"},
{"id":"jet-extra-750","icon":"◈","titleUk":"Резерв 750 JET","titleEn":"750 JET reserve","descUk":"Досягни балансу 750 JET.","descEn":"Reach a balance of 750 JET.","jet":750,"rarity":"legendary"},
{"id":"jet-extra-900","icon":"◈","titleUk":"Резерв 900 JET","titleEn":"900 JET reserve","descUk":"Досягни балансу 900 JET.","descEn":"Reach a balance of 900 JET.","jet":900,"rarity":"legendary"},
{"id":"jet-extra-1250","icon":"◈","titleUk":"Резерв 1250 JET","titleEn":"1250 JET reserve","descUk":"Досягни балансу 1250 JET.","descEn":"Reach a balance of 1250 JET.","jet":1250,"rarity":"legendary"},
{"id":"jet-extra-1500","icon":"◈","titleUk":"Резерв 1500 JET","titleEn":"1500 JET reserve","descUk":"Досягни балансу 1500 JET.","descEn":"Reach a balance of 1500 JET.","jet":1500,"rarity":"legendary"},
{"id":"jet-extra-2000","icon":"◈","titleUk":"Резерв 2000 JET","titleEn":"2000 JET reserve","descUk":"Досягни балансу 2000 JET.","descEn":"Reach a balance of 2000 JET.","jet":2000,"rarity":"legendary"},
{"id":"jet-extra-2500","icon":"◈","titleUk":"Резерв 2500 JET","titleEn":"2500 JET reserve","descUk":"Досягни балансу 2500 JET.","descEn":"Reach a balance of 2500 JET.","jet":2500,"rarity":"legendary"},
{"id":"jet-extra-3000","icon":"◈","titleUk":"Резерв 3000 JET","titleEn":"3000 JET reserve","descUk":"Досягни балансу 3000 JET.","descEn":"Reach a balance of 3000 JET.","jet":3000,"rarity":"legendary"},
{"id":"jet-extra-4000","icon":"◈","titleUk":"Резерв 4000 JET","titleEn":"4000 JET reserve","descUk":"Досягни балансу 4000 JET.","descEn":"Reach a balance of 4000 JET.","jet":4000,"rarity":"legendary"},
{"id":"jet-extra-5000","icon":"◈","titleUk":"Резерв 5000 JET","titleEn":"5000 JET reserve","descUk":"Досягни балансу 5000 JET.","descEn":"Reach a balance of 5000 JET.","jet":5000,"rarity":"legendary"},
{"id":"jet-extra-7500","icon":"◈","titleUk":"Резерв 7500 JET","titleEn":"7500 JET reserve","descUk":"Досягни балансу 7500 JET.","descEn":"Reach a balance of 7500 JET.","jet":7500,"rarity":"legendary"},
{"id":"jet-extra-10000","icon":"◈","titleUk":"Резерв 10000 JET","titleEn":"10000 JET reserve","descUk":"Досягни балансу 10000 JET.","descEn":"Reach a balance of 10000 JET.","jet":10000,"rarity":"legendary"},
{"id":"jet-extra-20000","icon":"◈","titleUk":"Резерв 20000 JET","titleEn":"20000 JET reserve","descUk":"Досягни балансу 20000 JET.","descEn":"Reach a balance of 20000 JET.","jet":20000,"rarity":"legendary"},
];
