// No AI API needed — pure keyword matching for intent classification

export type Intent =
  | "LOG_EXPENSE"
  | "SET_GOAL"
  | "QUERY_GOALS"
  | "QUERY_SPENDING"
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
  replyText: string;
}

// ── keyword maps ───────────────────────────────────────────────────────────────
const DAILY_KEYS: Record<string, string> = {
  "read":          "read_book",
  "book":          "read_book",
  "gym":           "gym",
  "workout":       "gym",
  "exercise":      "gym",
  "code":          "practice_code",
  "coding":        "practice_code",
  "programming":   "practice_code",
  "maths":         "practice_maths",
  "math":          "practice_maths",
  "mathematics":   "practice_maths",
};

const DIFFICULTY_KEYS: Record<string, "EASY" | "MEDIUM" | "HARD"> = {
  easy: "EASY", simple: "EASY", small: "EASY",
  medium: "MEDIUM", normal: "MEDIUM", moderate: "MEDIUM",
  hard: "HARD", difficult: "HARD", epic: "HARD", challenge: "HARD",
};

const CATEGORY_MAP: Record<string, string> = {
  "woolworths": "Groceries", "pick n pay": "Groceries", "checkers": "Groceries",
  "spar": "Groceries", "shoprite": "Groceries",
  "uber": "Transport", "bolt": "Transport", "gautrain": "Transport",
  "shell": "Transport", "engen": "Transport", "bp": "Transport",
  "kfc": "Dining Out", "mcdonalds": "Dining Out", "steers": "Dining Out",
  "nandos": "Dining Out", "restaurant": "Dining Out",
  "netflix": "Subscriptions", "spotify": "Subscriptions", "dstv": "Subscriptions",
  "clicks": "Health", "dischem": "Health", "pharmacy": "Health",
  "takealot": "Shopping", "mr price": "Shopping",
};

function detectCategory(merchant: string): string {
  const m = merchant.toLowerCase();
  for (const [kw, cat] of Object.entries(CATEGORY_MAP)) {
    if (m.includes(kw)) return cat;
  }
  return "Other";
}

// ── parse R amount from text e.g. "R250", "250", "R 1 500" ───────────────────
function parseAmount(text: string): number | undefined {
  const match = text.replace(/\s/g, "").match(/[Rr]?(\d+(?:[.,]\d+)?)/);
  if (!match) return undefined;
  return parseFloat(match[1].replace(",", "."));
}

// ── main parser ────────────────────────────────────────────────────────────────
export function parseMessage(text: string): ParsedMessage {
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/);

  // ── DAILY STATUS ─────────────────────────────────────────────────────────────
  if (lower.includes("daily") || lower === "today" || lower.includes("today's goals")) {
    return { intent: "DAILY_STATUS", replyText: "" };
  }

  // ── DAILY COMPLETE — "done gym", "finished reading", "did code" ──────────────
  const doneWords = ["done", "did", "finished", "completed", "complete"];
  if (doneWords.some(w => lower.startsWith(w))) {
    for (const [kw, key] of Object.entries(DAILY_KEYS)) {
      if (lower.includes(kw)) {
        return {
          intent: "DAILY_COMPLETE",
          dailyGoalKey: key,
          replyText: "",
        };
      }
    }
  }

  // ── LOG EXPENSE — "log R250 Woolworths", "spent R150 uber" ───────────────────
  const logWords = ["log", "spent", "spend", "paid", "bought", "purchased"];
  if (logWords.some(w => lower.startsWith(w))) {
    const amount = parseAmount(text);
    // Merchant = last word(s) after amount
    const merchantMatch = text.match(/[Rr]?\d[\d\s,.]* (.+)$/);
    const merchant = merchantMatch ? merchantMatch[1].trim() : "Unknown";
    return {
      intent: "LOG_EXPENSE",
      amount,
      merchant,
      category: detectCategory(merchant),
      replyText: "",
    };
  }

  // ── SET GOAL — "save R10000", "goal R5000 hard savings by December" ──────────
  const goalWords = ["save", "goal", "target", "achieve", "reach"];
  if (goalWords.some(w => lower.includes(w))) {
    const amount = parseAmount(text);
    const difficulty = words.reduce<"EASY" | "MEDIUM" | "HARD" | undefined>(
      (found, w) => found ?? DIFFICULTY_KEYS[w], undefined
    ) ?? "MEDIUM";

    // Detect goal type
    let goalType = "CUSTOM";
    if (lower.includes("save") || lower.includes("saving")) goalType = "SAVINGS";
    else if (lower.includes("spend") || lower.includes("budget")) goalType = "SPENDING_LIMIT";
    else if (lower.includes("worth")) goalType = "NET_WORTH";
    else if (lower.includes("trade") || lower.includes("stock")) goalType = "TRADE_TARGET";

    // Deadline — look for month names
    const months = ["january","february","march","april","may","june",
                    "july","august","september","october","november","december"];
    const foundMonth = months.find(m => lower.includes(m));
    let deadline: string | undefined;
    if (foundMonth) {
      const year = new Date().getFullYear();
      const monthIdx = months.indexOf(foundMonth) + 1;
      deadline = `${year}-${String(monthIdx).padStart(2,"0")}-28`;
    }

    // Title = everything after the amount if present, else whole message
    const titleMatch = text.match(/(?:save|goal|target)\s+(?:[Rr]?\d[\d\s,.]*\s+)?(.+?)(?:\s+by\s+\w+)?$/i);
    const title = titleMatch?.[1]?.trim() || text.replace(/[Rr]?\d+/g, "").trim() || "New Goal";

    return {
      intent: "SET_GOAL",
      goalTitle: title,
      goalType,
      goalDifficulty: difficulty,
      goalTarget: amount,
      goalDeadline: deadline,
      replyText: "",
    };
  }

  // ── QUERY GOALS ───────────────────────────────────────────────────────────────
  if (lower.includes("goal") || lower.includes("progress") || lower.includes("show goals")) {
    return { intent: "QUERY_GOALS", replyText: "" };
  }

  // ── QUERY SPENDING ────────────────────────────────────────────────────────────
  if (lower.includes("spending") || lower.includes("spent") || lower.includes("budget")
      || lower.includes("how am i doing") || lower.includes("summary")) {
    return { intent: "QUERY_SPENDING", replyText: "" };
  }

  // ── HELP ──────────────────────────────────────────────────────────────────────
  if (lower === "help" || lower === "/help") {
    return { intent: "HELP", replyText: "" };
  }

  return {
    intent: "UNKNOWN",
    replyText: "I didn't catch that. Type *help* to see what I can do.",
  };
}