import dotenv from "dotenv";
dotenv.config();

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN!,
  pythonApiUrl: process.env.PYTHON_API_URL ?? "http://localhost:8000",
  defaultUserId: process.env.DEFAULT_USER_ID ?? "",
};

const required = ["DATABASE_URL", "TELEGRAM_BOT_TOKEN"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}