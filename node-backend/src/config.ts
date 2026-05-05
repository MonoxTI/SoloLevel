import dotenv from "dotenv";
dotenv.config();

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN!,
  anthropicKey: process.env.ANTHROPIC_API_KEY!,
  pythonApiUrl: process.env.PYTHON_API_URL ?? "http://localhost:8000",
  defaultUserId: process.env.DEFAULT_USER_ID ?? "",
};

// Fail fast if critical env vars are missing
const required = ["DATABASE_URL", "TELEGRAM_BOT_TOKEN", "ANTHROPIC_API_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}