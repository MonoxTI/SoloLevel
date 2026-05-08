export type Intent =
  | "LOG_EXPENSE"
  | "LOG_INCOME"
  | "SET_GOAL"
  | "QUERY_GOALS"
  | "QUERY_SPENDING"
  | "SET_NET_WORTH"
  | "QUERY_NET_WORTH"
  | "QUERY_SIGNALS"
  | "DAILY_COMPLETE"
  | "DAILY_STATUS"
  | "HELP"
  | "UNKNOWN";

export interface ParsedMessage {
  intent: Intent;
  amount?: number;
  merchant?: string;
  category?: string;
  note?: string;
  goalTitle?: string;
  goalType?: string;
  goalDifficulty?: "EASY" | "MEDIUM" | "HARD";
  goalTarget?: number;
  goalDeadline?: string;
  dailyGoalKey?: string;
  symbol?: string;
  replyText: string;
}

const DAILY_KEYS: Record<string, string> = {
  "read": "read_book", "book": "read_book",
  "gym": "gym", "workout": "gym", "exercise": "gym",
  "code": "practice_code", "coding": "practice_code", "programming": "practice_code",
  "maths": "practice_maths", "math": "practice_maths",
};

const DIFFICULTY_KEYS: Record<string, "EASY" | "MEDIUM" | "HARD"> = {
  easy: "EASY", simple: "EASY", small: "EASY",
  medium: "MEDIUM", normal: "MEDIUM",
  hard: "HARD", difficult: "HARD", epic: "HARD",
};

const CATEGORY_MAP: Record<string, string> = {
  "woolworths": "Groceries", "pick n pay": "Groceries", "checkers": "Groceries",
  "spar": "Groceries", "shoprite": "Groceries",
  "uber": "Transport", "bolt": "Transport", "gautrain": "Transport",
  "shell": "Transport", "engen": "Transport",
  "kfc": "Dining Out", "mcdonalds": "Dining Out", "steers": "Dining Out",
  "nandos": "Dining Out", "restaurant": "Dining Out",
  "netflix": "Subscriptions", "spotify": "Subscriptions", "dstv": "Subscriptions",
  "clicks": "Health", "dischem": "Health",
  "takealot": "Shopping", "mr price": "Shopping",
  "salary": "Income", "deposit": "Income", "freelance": "Income",
};

function detectCategory(merchant: string): string {
  const m = merchant.toLowerCase();
  for (const [kw, cat] of Object.entries(CATEGORY_MAP)) {
    if (m.includes(kw)) return cat;
  }
  return "Other";
}

function parseAmount(text: string): number | undefined {
  const match = text.replace(/\s/g, "").match(/[Rr]?(\d+(?:[.,]\d+)?)/);
  if (!match) return undefined;
  return parseFloat(match[1].replace(",", "."));
}

export function parseMessage(text: string): ParsedMessage {
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/);

  // ── DAILY STATUS
  if (lower === "daily" || lower === "today" || lower.includes("today's goals")) {
    return { intent: "DAILY_STATUS", replyText: "" };
  }

  // ── DAILY COMPLETE
  const doneWords = ["done", "did", "finished", "completed"];
  if (doneWords.some(w => lower.startsWith(w))) {
    for (const [kw, key] of Object.entries(DAILY_KEYS)) {
      if (lower.includes(kw)) {
        return { intent: "DAILY_COMPLETE", dailyGoalKey: key, replyText: "" };
      }
    }
  }

  // ── SET NET WORTH — "set net worth R50000" / "my net worth is R50000"
  if ((lower.includes("set") || lower.includes("my")) && lower.includes("net worth") ||
      lower.includes("set worth") || lower.startsWith("worth")) {
    const amount = parseAmount(text);
    return { intent: "SET_NET_WORTH", amount, replyText: "" };
  }

  // ── QUERY NET WORTH — "net worth" / "what is my net worth"
  if (lower.includes("net worth") || lower.includes("my worth")) {
    return { intent: "QUERY_NET_WORTH", replyText: "" };
  }

  // ── TRADING SIGNALS — "signals" / "scan market" / "check NPN.JO"
  if (lower.includes("signal") || lower.includes("scan") || lower.includes("trade alert")
      || lower.includes("check stock") || lower.match(/[a-z]+\.jo/)) {
    const symbolMatch = text.match(/([A-Z]+\.JO)/i);
    return {
      intent: "QUERY_SIGNALS",
      symbol: symbolMatch ? symbolMatch[1].toUpperCase() : undefined,
      replyText: "",
    };
  }

  // ── LOG INCOME — "income R5000 salary" / "received R3000"
  const incomeWords = ["income", "received", "salary", "paid in", "deposit", "earned"];
  if (incomeWords.some(w => lower.includes(w))) {
    const amount = parseAmount(text);
    const merchantMatch = text.match(/[Rr]?\d[\d\s,.]* (.+)$/);
    const merchant = merchantMatch ? merchantMatch[1].trim() : "Income";
    return { intent: "LOG_INCOME", amount, merchant, category: "Income", replyText: "" };
  }

  // ── LOG EXPENSE
  const logWords = ["log", "spent", "spend", "paid", "bought"];
  if (logWords.some(w => lower.startsWith(w))) {
    const amount = parseAmount(text);
    const merchantMatch = text.match(/[Rr]?\d[\d\s,.]* (.+)$/);
    const merchant = merchantMatch ? merchantMatch[1].trim() : "Unknown";
    return {
      intent: "LOG_EXPENSE", amount, merchant,
      category: detectCategory(merchant), replyText: "",
    };
  }

  // ── SET GOAL
  const goalWords = ["save", "goal", "target", "achieve"];
  if (goalWords.some(w => lower.includes(w))) {
    const amount = parseAmount(text);
    const difficulty = words.reduce<"EASY" | "MEDIUM" | "HARD" | undefined>(
      (found, w) => found ?? DIFFICULTY_KEYS[w], undefined
    ) ?? "MEDIUM";
    let goalType = "CUSTOM";
    if (lower.includes("save") || lower.includes("saving")) goalType = "SAVINGS";
    else if (lower.includes("spend")) goalType = "SPENDING_LIMIT";
    else if (lower.includes("worth")) goalType = "NET_WORTH";
    else if (lower.includes("trade")) goalType = "TRADE_TARGET";
    const months = ["january","february","march","april","may","june",
                    "july","august","september","october","november","december"];
    const foundMonth = months.find(m => lower.includes(m));
    let deadline: string | undefined;
    if (foundMonth) {
      const year = new Date().getFullYear();
      deadline = `${year}-${String(months.indexOf(foundMonth) + 1).padStart(2,"0")}-28`;
    }
    const titleMatch = text.match(/(?:save|goal|target)\s+(?:[Rr]?\d[\d\s,.]*\s+)?(.+?)(?:\s+by\s+\w+)?$/i);
    const title = titleMatch?.[1]?.trim() || text.replace(/[Rr]?\d+/g,"").trim() || "New Goal";
    return { intent: "SET_GOAL", goalTitle: title, goalType, goalDifficulty: difficulty, goalTarget: amount, goalDeadline: deadline, replyText: "" };
  }

  // ── QUERIES
  if (lower.includes("goal") || lower.includes("progress")) return { intent: "QUERY_GOALS", replyText: "" };
  if (lower.includes("spending") || lower.includes("budget") || lower.includes("how am i doing")) return { intent: "QUERY_SPENDING", replyText: "" };
  if (lower === "help" || lower === "/help") return { intent: "HELP", replyText: "" };

  return { intent: "UNKNOWN", replyText: "Type *help* to see what I can do." };
}