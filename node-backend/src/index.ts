import "./config"; // validates env vars on startup
import { createBot } from "./bot/telegram";
import { prisma } from "./db/prisma";

async function main() {
  // Verify DB connection
  await prisma.$connect();
  console.log("✅ Database connected");

  const bot = createBot();

  // Graceful shutdown
  process.once("SIGINT", () => {
    bot.stop();
    prisma.$disconnect();
  });
  process.once("SIGTERM", () => {
    bot.stop();
    prisma.$disconnect();
  });

  console.log("🤖 MonoxBot starting...");
  await bot.start();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});