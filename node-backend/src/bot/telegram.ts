import { Bot } from "grammy";
import { config } from "../config";
import { parseMessage } from "../ai/brain";
import { handleParsed } from "./handlers";

export function createBot() {
  const bot = new Bot(config.telegramToken);

  bot.command("start", async (ctx) => {
    await ctx.reply(
      `👋 Hey! I'm MonoxBot — your personal finance AI.\n\n` +
      `Try:\n` +
      `• _log R250 Woolworths_\n` +
      `• _save R5000 hard by December_\n` +
      `• _done gym_\n` +
      `• _daily_\n` +
      `• _signals_\n\n` +
      `Type *help* for all commands.`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("goals",    async (ctx) => { await ctx.reply("Loading goals..."); await handleParsed(ctx, { intent: "QUERY_GOALS",   replyText: "" }); });
  bot.command("spending", async (ctx) => { await ctx.reply("Loading spending..."); await handleParsed(ctx, { intent: "QUERY_SPENDING", replyText: "" }); });
  bot.command("daily",    async (ctx) => { await handleParsed(ctx, { intent: "DAILY_STATUS",  replyText: "" }); });
  bot.command("signals",  async (ctx) => { await handleParsed(ctx, { intent: "QUERY_SIGNALS", replyText: "" }); });
  bot.command("networth", async (ctx) => { await handleParsed(ctx, { intent: "QUERY_NET_WORTH", replyText: "" }); });

  // All text messages
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;

    // Skip commands (handled above)
    if (text.startsWith("/")) return;

    console.log(`[BOT] Received: "${text}"`);

    try {
      const parsed = parseMessage(text);
      console.log(`[BOT] Parsed intent: ${parsed.intent}`, JSON.stringify(parsed, null, 2));

      if (parsed.intent === "UNKNOWN") {
        await ctx.reply(
          `❓ Didn't recognise that.\n\nTry:\n` +
          `• *log R250 Woolworths*\n` +
          `• *spent R150 Uber*\n` +
          `• *income R5000 salary*\n` +
          `• *save R5000 hard by December*\n` +
          `• *done gym*\n` +
          `• *signals*\n` +
          `• *help*`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      await ctx.replyWithChatAction("typing");
      await handleParsed(ctx, parsed);

    } catch (err) {
      console.error("[BOT] Error:", err);
      await ctx.reply("Something went wrong. Check the console for details.");
    }
  });

  bot.catch((err) => {
    console.error("[BOT] Unhandled error:", err);
  });

  return bot;
}