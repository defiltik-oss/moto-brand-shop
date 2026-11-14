/**
 * Глобальна конфігурація застосунку Alexov Shop (Українська + English).
 * Менеджер замовлень у Telegram: @Alexov_Manager (https://t.me/Alexov_Manager)
 */
export const SITE_CONFIG = {
  managerUsername: 'Alexov_Manager',
  youtubeChannelUrl: 'https://www.youtube.com/@Alexov_STREET_TEAM_official',

  payment: {
    cardNumber: '4874100032959606',
    cardNumberFormatted: '4874 1000 3295 9606',
    cardHolder: 'ALEXOV SHOP',
    monoJarUrl: 'https://send.monobank.ua/jar/6DpsRjriTZ',
  },

  donation: {
    cardNumber: '4874 0700 2905 4424',
    cardHolder: 'ALEXOV SHOP',
    monoJarUrl: 'https://send.monobank.ua/jar/6DpsRjriTZ',
  },

  socials: [
    {
      id: 'telegram',
      labelUk: 'Telegram-канал',
      labelEn: 'Telegram Channel',
      subUk: '@Alexov_Street_Team',
      subEn: '@Alexov_Street_Team',
      handle: '@Alexov_Street_Team',
      url: 'https://t.me/Alexov_Street_Team',
    },
    {
      id: 'tiktok',
      labelUk: 'TikTok Акаунт',
      labelEn: 'TikTok Account',
      subUk: '@alexov777_official',
      subEn: '@alexov777_official',
      handle: '@alexov777_official',
      url: 'https://www.tiktok.com/@alexov777_official',
    },
    {
      id: 'youtube',
      labelUk: 'YouTube-канал',
      labelEn: 'YouTube Channel',
      subUk: '6.52K підписників',
      subEn: '6.52K subscribers',
      handle: '@Alexov_STREET_TEAM_official',
      url: 'https://www.youtube.com/@Alexov_STREET_TEAM_official',
    },
    {
      id: 'manager',
      labelUk: 'Менеджер замовлень',
      labelEn: 'Order Manager',
      subUk: '@Alexov_Manager',
      subEn: '@Alexov_Manager',
      handle: '@Alexov_Manager',
      url: 'https://t.me/Alexov_Manager',
    },
  ],

  /** Актуальні 4 відео з офіційного YouTube-каналу (свіжий ролик D6lvcRNs1jM на 1-му місці) */
  videos: [
    {
      id: 'v1',
      youtubeId: 'D6lvcRNs1jM',
      url: 'https://youtu.be/D6lvcRNs1jM',
      titleUk: 'СТАНТ під ОНДА АНДАР по ГОРОДУ — НАКАТУЮ скіл',
      titleEn: 'CITY STUNT RIDE — LEVELING UP SKILLS',
      badgeUk: 'ВІДЕО #1 · НОВЕ',
      badgeEn: 'VIDEO #1 · NEW',
      thumb: 'https://i.ytimg.com/vi/D6lvcRNs1jM/hqdefault.jpg',
    },
    {
      id: 'v2',
      youtubeId: 'Fohiccct62w',
      url: 'https://www.youtube.com/watch?v=Fohiccct62w',
      titleUk: "НЕВДАЛІ спроби ПОСТАВИТИ 12 O'clock на СУРОН УЛЬТРА — БЕКСТЕЙДЖ зйомок КЛІПУ",
      titleEn: "12 O'CLOCK ATTEMPTS ON SUR-RON ULTRA — MUSIC VIDEO BACKSTAGE",
      badgeUk: 'ВІДЕО #2 · ТОП',
      badgeEn: 'VIDEO #2 · TOP',
      thumb: 'https://i.ytimg.com/vi/Fohiccct62w/hqdefault.jpg',
    },
    {
      id: 'v3',
      youtubeId: '0auyKzYuw90',
      url: 'https://www.youtube.com/watch?v=0auyKzYuw90',
      titleUk: 'СТАНТ по МІСТУ — ВПАВ в ОЗЕРО, БІЙКА з ДРУГОМ',
      titleEn: 'STREET STUNT VLOG — FELL INTO A LAKE',
      badgeUk: 'ВІДЕО #3 · ВЛОГ',
      badgeEn: 'VIDEO #3 · VLOG',
      thumb: 'https://i.ytimg.com/vi/0auyKzYuw90/hqdefault.jpg',
    },
    {
      id: 'v4',
      youtubeId: '1dvCrTLrZbs',
      url: 'https://www.youtube.com/watch?v=1dvCrTLrZbs',
      titleUk: 'ЧОМУ Я НАВЧИВСЯ в СТАНТІ за ЦЕЙ сезон — ПРОБИВ ПОКРИШКУ',
      titleEn: 'WHAT I LEARNED IN STUNT THIS SEASON — FLAT TIRE',
      badgeUk: 'ВІДЕО #4 · ОГЛЯД',
      badgeEn: 'VIDEO #4 · REVIEW',
      thumb: 'https://i.ytimg.com/vi/1dvCrTLrZbs/hqdefault.jpg',
    },
  ],
} as const;
