/**
 * Cloudflare Pages Function / Worker для Telegram-бота Alexov Shop (/webhook)
 *
 * Змінні середовища (Cloudflare Pages -> Settings -> Environment variables):
 * - BOT_TOKEN: токен вашого Telegram-бота від @BotFather
 * - WEBAPP_URL: URL міні-додатка (за замовчуванням визначається автоматично з домену запиту)
 */

const ORDERS_GROUP_ID = '-5192049314';

const START_TEXT = `Вітаю в магазині Alexov Shop!

Тут ви можете замовити наклейки, кофти, футболки та рекламу. 

Про проект:
- Весь актуальний контент, нові колекції та анонси публікуються в нашому Telegram-каналі.

Наші ресурси:
- Telegram-канал: https://t.me/ebike_team_official
- TikTok: https://www.tiktok.com/@alexov777_official
- YouTube-канал: https://www.youtube.com/@Alexov_STREET_TEAM_official

З усіх питань, замовлень та співпраці звертайтеся до менеджера @Alexov_Manager.`;

export async function onRequestPost(context) {
  const { request, env } = context;
  const botToken = env.BOT_TOKEN;
  if (!env.TELEGRAM_WEBHOOK_SECRET || !botToken) return new Response('Webhook not configured', {status:503});
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Forbidden', {status:403});
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const message = update?.message;
  const text = message?.text?.trim() || '';

  if (message?.chat?.id && (text === '/start' || text.startsWith('/start '))) {
    const chatId = message.chat.id;
    const origin = new URL(request.url).origin;
    const webAppUrl = env.WEBAPP_URL || origin;
    const bannerUrl = `${webAppUrl.replace(/\/$/, '')}/banner.JPG`;

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: 'Відкрити магазин',
            web_app: { url: webAppUrl },
          },
        ],
      ],
    };

    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;
    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: bannerUrl,
        caption: START_TEXT,
        reply_markup: replyMarkup,
      }),
    });

    if (!response.ok) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: START_TEXT,
          disable_web_page_preview: true,
          reply_markup: replyMarkup,
        }),
      });
    }
  } else if (
    message?.chat?.id &&
    String(message.chat.id) !== ORDERS_GROUP_ID &&
    message?.chat?.type === 'private' &&
    (message?.photo || message?.document || message?.text)
  ) {
    await fetch(`https://api.telegram.org/bot${botToken}/forwardMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ORDERS_GROUP_ID,
        from_chat_id: message.chat.id,
        message_id: message.message_id,
      }),
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
