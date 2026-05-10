import "./config";
import express from "express";
import { createBot } from "./bot/telegram";
import { prisma } from "./db/prisma";
import { setBotInstance, sendTelegramMessage } from "./webhooks/notify";

async function main() {
  await prisma.$connect();
  console.log("✅ Database connected");

  const bot = createBot();
  setBotInstance(bot);

  // Express server for webhooks from Python backend
  const app = express();
  app.use(express.json());

  // Python calls this to push Telegram notifications
  app.post("/notify", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    await sendTelegramMessage(message);
    res.json({ sent: true });
  });

  // Health check
  app.get("/health", ( res) => res.json({ status: "ok" }));

  const PORT = parseInt(process.env.PORT ?? "3001");
  app.listen(PORT, () => console.log(`✅ Webhook server running on port ${PORT}`));

  process.once("SIGINT", () => { bot.stop(); prisma.$disconnect(); });
  process.once("SIGTERM", () => { bot.stop(); prisma.$disconnect(); });

  console.log("🤖 MonoxBot starting...");
  await bot.start();
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});