import { Bot } from "grammy";
import { config } from "../config";
import { parseMessage } from "../ai/brain";
import { handleParsed } from "./handlers";

export function createBot() {
  const bot = new Bot(config.telegramToken);

  // /start command
  bot.command("start", async (ctx) => {
    await ctx.reply(
      `👋 Hey! I'm MonoxBot — your personal finance AI.\n\n` +
      `I can:\n` +
      `• Log expenses: _"log R250 Uber"_\n` +
      `• Set goals: _"save R10000 by December"_\n` +
      `• Check spending: _"how am I doing this month?"_\n` +
      `• Show goals: _"show my goals"_\n\n` +
      `Every action earns XP. Let's go! 🚀`,
      { parse_mode: "Markdown" }
    );
  });

  // /goals shortcut
  bot.command("goals", async (ctx) => {
    const parsed = await parseMessage("show my goals");
    await handleParsed(ctx, parsed);
  });

  // /spending shortcut
  bot.command("spending", async (ctx) => {
    const parsed = await parseMessage("how am I doing this month?");
    await handleParsed(ctx, parsed);
  });

  // All other text messages — run through AI brain
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;

    // Show typing indicator
    await ctx.replyWithChatAction("typing");

    try {
      const parsed = await parseMessage(text);
      await handleParsed(ctx, parsed);
    } catch (err) {
      console.error("Bot error:", err);
      await ctx.reply("Something went wrong. Try again in a sec.");
    }
  });

  bot.catch((err) => {
    console.error("Unhandled bot error:", err);
  });

  return bot;
}