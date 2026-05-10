import { Bot } from "grammy";

let _bot: Bot | null = null;

export function setBotInstance(bot: Bot) {
  _bot = bot;
}

export async function sendTelegramMessage(message: string): Promise<void> {
  if (!_bot) {
    console.warn("Bot not initialised — cannot send notification");
    return;
  }
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.warn("TELEGRAM_CHAT_ID not set in .env");
    return;
  }
  try {
    await _bot.api.sendMessage(chatId, message, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Failed to send Telegram message:", err);
  }
}