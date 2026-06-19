import "./config";
import express from "express";
import { Bot } from "grammy";
import { prisma } from "./db/prisma";
import { setBotInstance, sendTelegramMessage } from "./webhooks/notify";
import { notebooksRouter, notesRouter, todosRouter } from "./routes/notesAndTodos";
import { startTodoScheduler } from "./services/todoScheduler";
import { handleParsed } from "./bot/handlers";
import { parseMessage } from "./ai/brain";

function createBot(token: string, label: string): Bot {
  const bot = new Bot(token);

  bot.command("start", ctx => ctx.reply(
    `👋 MonoxBot (${label}) online!\nType *help* to see commands.`,
    { parse_mode: "Markdown" }
  ));

  bot.on("message:text", async ctx => {
    const text = ctx.message.text.trim();
    console.log(`[${label}] ${ctx.from?.username ?? "?"}: ${text}`);
    const parsed = parseMessage(text);
    await handleParsed(ctx, parsed);
  });

  bot.catch(err => console.error(`[${label}] Bot error:`, err));
  return bot;
}

async function main() {
  await prisma.$connect();
  console.log("✅ Database connected");

  // ── Primary bot ────────────────────────────────────────────────────────────
  const token1 = process.env.TELEGRAM_BOT_TOKEN;
  if (!token1) { console.error("TELEGRAM_BOT_TOKEN not set"); process.exit(1); }
  const bot1 = createBot(token1, "Bot1");
  setBotInstance(bot1);

  // ── Second bot (same data, different chat) ─────────────────────────────────
  const token2 = process.env.TELEGRAM_BOT_TOKEN_2;
  let bot2: Bot | null = null;
  if (token2) {
    bot2 = createBot(token2, "Bot2");
    console.log("✅ Second bot configured");
  } else {
    console.log("ℹ️  TELEGRAM_BOT_TOKEN_2 not set — running single bot only");
  }

  // ── Express server ─────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  app.post("/notify", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    await sendTelegramMessage(message);
    res.json({ sent: true });
  });

  app.use("/notebooks", notebooksRouter);
  app.use("/notes",     notesRouter);
  app.use("/todos",     todosRouter);
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  const PORT = parseInt(process.env.PORT ?? "3001");
  app.listen(PORT, () => console.log(`✅ Server on port ${PORT}`));

  startTodoScheduler();

  process.once("SIGINT",  () => { bot1.stop(); bot2?.stop(); prisma.$disconnect(); });
  process.once("SIGTERM", () => { bot1.stop(); bot2?.stop(); prisma.$disconnect(); });

  console.log("🤖 Starting bots...");
  if (bot2) {
    // Start both in parallel
    await Promise.all([bot1.start(), bot2.start()]);
  } else {
    await bot1.start();
  }
}

main().catch(err => { console.error("Fatal error:", err); process.exit(1); });