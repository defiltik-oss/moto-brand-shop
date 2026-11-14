"""
Telegram-бот Alexov Shop (Python / aiogram 3.x або pyTelegramBotAPI)

Запуск:
  pip install aiogram
  export BOT_TOKEN="ваш_токен"
  export WEBAPP_URL="https://ваш-домен.pages.dev"
  python bot/bot.py
"""

import asyncio
import os
from pathlib import Path
from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import (
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)

BOT_TOKEN = os.getenv("BOT_TOKEN", "YOUR_BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://alexov-shop.pages.dev")
BANNER_PATH = Path(__file__).resolve().parent.parent / "public" / "banner.JPG"

START_TEXT = """*Вітаю в магазині Alexov Shop!* 🏍️

Тут ви можете замовити наклейки, кофти, футболки та рекламу.

_Про проект:_
• Весь актуальний контент, нові колекції та анонси публікуються в нашому [Telegram-каналі](https://t.me/ebike_team_official).

_Наші ресурси:_
• [Telegram-канал](https://t.me/ebike_team_official) 📲
• [TikTok](https://www.tiktok.com/@alexov777_official) 🎬
• [YouTube-канал](https://www.youtube.com/@Alexov_STREET_TEAM_official) 🎥

З усіх питань, замовлень та співпраці звертайтеся до менеджера [@Alexov\\_Manager](https://t.me/Alexov_Manager)."""

dp = Dispatcher()


@dp.message(CommandStart())
async def cmd_start(message: Message) -> None:
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Відкрити магазин",
                    web_app=WebAppInfo(url=WEBAPP_URL),
                )
            ]
        ]
    )

    photo = FSInputFile(BANNER_PATH)
    await message.answer_photo(
        photo=photo,
        caption=START_TEXT,
        parse_mode="Markdown",
        reply_markup=keyboard,
    )


async def main() -> None:
    bot = Bot(token=BOT_TOKEN)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
