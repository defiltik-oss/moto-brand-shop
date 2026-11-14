/**
 * Telegram-бот Alexov Shop (Node.js / Long Polling або Cloudflare Worker)
 *
 * Запуск (Node.js 18+ без сторонніх залежностей):
 *   BOT_TOKEN="ваш_токен" WEBAPP_URL="https://ваш-домен.pages.dev" node bot/bot.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://alexov-shop.pages.dev';
const BANNER_PATH = path.resolve(__dirname, '../public/banner.JPG');

export const START_TEXT = `*Вітаю в магазині Alexov Shop!* 🏍️

Тут ви можете замовити наклейки, кофти, футболки та рекламу.

_Про проект:_
• Весь актуальний контент, нові колекції та анонси публікуються в нашому [Telegram-каналі](https://t.me/ebike_team_official).

_Наші ресурси:_
• [Telegram-канал](https://t.me/ebike_team_official) 📲
• [TikTok](https://www.tiktok.com/@alexov777_official) 🎬
• [YouTube-канал](https://www.youtube.com/@Alexov_STREET_TEAM_official) 🎥

З усіх питань, замовлень та співпраці звертайтеся до менеджера [@Alexov\_Manager](https://t.me/Alexov_Manager).`;

export const START_REPLY_MARKUP = {
  inline_keyboard: [
    [
      {
        text: 'Відкрити магазин',
        web_app: { url: WEBAPP_URL },
      },
    ],
  ],
};

async function sendStartBanner(chatId) {
  const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', START_TEXT);
  form.append('parse_mode', 'Markdown');
  form.append('reply_markup', JSON.stringify(START_REPLY_MARKUP));

  if (fs.existsSync(BANNER_PATH)) {
    const fileBuffer = fs.readFileSync(BANNER_PATH);
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    form.append('photo', blob, path.basename(BANNER_PATH));
  } else {
    form.append('photo', `${WEBAPP_URL.replace(/\/$/, '')}/banner.JPG`);
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Помилка sendPhoto:', errText);
  }
}

async function pollUpdates() {
  if (!BOT_TOKEN) {
    console.error('Вкажіть змінну середовища BOT_TOKEN перед запуском бота.');
    process.exit(1);
  }

  console.log('Alexov Shop Bot запущено...');
  let offset = 0;

  while (true) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`
      );
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          const text = update?.message?.text?.trim() || '';
          const chatId = update?.message?.chat?.id;

          if (chatId && (text === '/start' || text.startsWith('/start '))) {
            await sendStartBanner(chatId);
          }
        }
      }
    } catch (err) {
      console.error('Помилка опитування Telegram API:', err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  pollUpdates();
}
