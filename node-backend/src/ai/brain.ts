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
  | "ADD_NOTE"
  | "QUERY_NOTES"
  | "ADD_TODO"
  | "QUERY_TODOS"
  | "DONE_TODO"
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
  noteContent?: string;
  todoContent?: string;
  todoIndex?: number;
  replyText: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAmount(text: string): number | undefined {
  const clean = text.replace(/\s+/g, " ");
  const match = clean.match(/[Rr]\s?(\d[\d,. ]*\d|\d)/);
  if (match) return parseFloat(match[1].replace(/[, ]/g, ""));
  const plain = clean.match(/^(\d+(?:\.\d+)?)/);
  if (plain) return parseFloat(plain[1]);
  return undefined;
}

function detectCategory(merchant: string): string {
  const m = merchant.toLowerCase();
  const rules: [string[], string][] = [
    [["woolworths", "pick n pay", "checkers", "spar", "shoprite", "food lover", "freshstop"], "Groceries"],
    [["uber", "bolt", "gautrain", "shell", "engen", "bp", "caltex", "sasol", "total"], "Transport"],
    [["restaurant", "café", "cafe", "mcdonalds", "kfc", "steers", "nandos", "debonairs", "burger", "pizza"], "Dining Out"],
    [["netflix", "spotify", "showmax", "dstv", "amazon", "apple", "google", "microsoft"], "Subscriptions"],
    [["eskom", "municipality", "city power", "rand water", "telkom", "vodacom", "mtn", "cell c"], "Utilities"],
    [["takealot", "mr price", "edgars", "zara", "h&m", "cotton on"], "Shopping"],
    [["clicks", "dischem", "pharmacy", "doctor", "dentist", "gym", "virgin active", "planet fitness"], "Health"],
    [["salary", "freelance", "payment", "deposit", "transfer"], "Income"],
  ];
  for (const [keywords, cat] of rules) {
    if (keywords.some(kw => m.includes(kw))) return cat;
  }
  return "Other";
}

const DAILY_KEYS: [string[], string][] = [
  [["read", "book", "reading"], "read_book"],
  [["gym", "workout", "exercise", "train", "training"], "gym"],
  [["code", "coding", "programming", "dev", "develop"], "practice_code"],
  [["maths", "math", "mathematics"], "practice_maths"],
];

function parseDailyKey(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [keywords, key] of DAILY_KEYS) {
    if (keywords.some(kw => lower.includes(kw))) return key;
  }
  return undefined;
}

const DIFFICULTY_WORDS: Record<string, "EASY" | "MEDIUM" | "HARD"> = {
  easy: "EASY", simple: "EASY", small: "EASY", light: "EASY",
  medium: "MEDIUM", normal: "MEDIUM", moderate: "MEDIUM", mid: "MEDIUM",
  hard: "HARD", difficult: "HARD", epic: "HARD", big: "HARD",
};

function parseDifficulty(text: string): "EASY" | "MEDIUM" | "HARD" {
  const lower = text.toLowerCase();
  for (const [word, diff] of Object.entries(DIFFICULTY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return diff;
  }
  return "MEDIUM";
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function parseDeadline(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [name, num] of Object.entries(MONTHS)) {
    if (lower.includes(name)) {
      const now   = new Date();
      const year  = num <= now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
      return `${year}-${String(num).padStart(2, "0")}-28`;
    }
  }
  return undefined;
}

// ── Main parser ────────────────────────────────────────────────────────────────

export function parseMessage(text: string): ParsedMessage {
  const raw   = text.trim();
  const lower = raw.toLowerCase().replace(/\s+/g, " ");

  // ── Help ──────────────────────────────────────────────────────────────────
  if (["/start", "/help", "help", "commands", "?"].includes(lower)) {
    return { intent: "HELP", replyText: "" };
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  // "note: buy milk", "note buy milk", "remember: call mom"
  const noteMatch = raw.match(/^(note|remember)\s*[:\-]?\s*(.+)/i);
  if (noteMatch && noteMatch[2]?.trim()) {
    return { intent: "ADD_NOTE", noteContent: noteMatch[2].trim(), replyText: "" };
  }
  if (["/notes", "notes", "show notes", "my notes", "view notes", "list notes"].includes(lower)) {
    return { intent: "QUERY_NOTES", replyText: "" };
  }

  // ── Todos ─────────────────────────────────────────────────────────────────
  // "todo: finish report", "todo finish report", "add todo call accountant"
  const todoMatch = raw.match(/^(todo|add todo|to-do|to do)\s*[:\-]?\s*(.+)/i);
  if (todoMatch && todoMatch[2]?.trim()) {
    return { intent: "ADD_TODO", todoContent: todoMatch[2].trim(), replyText: "" };
  }
  if (["/todos", "todos", "show todos", "my todos", "view todos", "list todos", "todo list"].includes(lower)) {
    return { intent: "QUERY_TODOS", replyText: "" };
  }
  // "done todo 2", "complete todo 1", "finish todo 3"
  const doneTodoMatch = raw.match(/^(done|complete|finish|finished)\s+todo\s+(\d+)/i);
  if (doneTodoMatch) {
    return { intent: "DONE_TODO", todoIndex: parseInt(doneTodoMatch[2]), replyText: "" };
  }

  // ── Goals shortcuts ───────────────────────────────────────────────────────
  if (["/goals", "show goals", "my goals", "goals", "view goals", "list goals", "show my goals"].includes(lower)) {
    return { intent: "QUERY_GOALS", replyText: "" };
  }

  // ── Spending shortcuts ────────────────────────────────────────────────────
  if (["/spending", "spending", "budget", "how am i doing", "summary", "my spending", "show spending"].includes(lower)) {
    return { intent: "QUERY_SPENDING", replyText: "" };
  }

  // ── Daily status ──────────────────────────────────────────────────────────
  if (["daily", "today", "today's goals", "/daily", "daily goals", "show daily"].includes(lower)) {
    return { intent: "DAILY_STATUS", replyText: "" };
  }

  // ── Daily complete — "done gym", "finished reading", "did code" ──────────
  if (/^(done|did|finished|completed|complete)\s+\S+/i.test(raw) && !doneTodoMatch) {
    const key = parseDailyKey(raw);
    if (key) return { intent: "DAILY_COMPLETE", dailyGoalKey: key, replyText: "" };
  }

  // ── Trading signals ───────────────────────────────────────────────────────
  if (["signals", "scan", "scan market", "trade signals", "forex", "forex signals"].includes(lower)) {
    return { intent: "QUERY_SIGNALS", replyText: "" };
  }
  const checkMatch = raw.match(/^check\s+([A-Za-z0-9.]+)$/i);
  if (checkMatch) {
    return { intent: "QUERY_SIGNALS", symbol: checkMatch[1].toUpperCase(), replyText: "" };
  }

  // ── Net worth ─────────────────────────────────────────────────────────────
  if (/net\s*worth/i.test(lower) && /set|update|change|is/i.test(lower)) {
    return { intent: "SET_NET_WORTH", amount: parseAmount(raw), replyText: "" };
  }
  if (/net\s*worth/i.test(lower) || lower === "worth" || lower === "my worth") {
    return { intent: "QUERY_NET_WORTH", replyText: "" };
  }

  // ── Log income ────────────────────────────────────────────────────────────
  if (/^(income|received|salary|earned|deposit|paid in)\b/i.test(raw)) {
    const amount      = parseAmount(raw);
    const afterCmd    = raw.replace(/^(income|received|salary|earned|deposit|paid in)\s*/i, "");
    const afterAmount = afterCmd.replace(/[Rr]\s?\d[\d,. ]*/g, "").trim();
    const merchant    = afterAmount || "Income";
    return { intent: "LOG_INCOME", amount, merchant, category: "Income", replyText: "" };
  }

  // ── Log expense ───────────────────────────────────────────────────────────
  if (/^(log|spent|spend|paid|bought|purchased)\b/i.test(raw)) {
    const amount      = parseAmount(raw);
    const afterCmd    = raw.replace(/^(log|spent|spend|paid|bought|purchased)\s*/i, "");
    const afterAmount = afterCmd.replace(/[Rr]\s?\d[\d,. ]*/g, "").trim();
    const merchant    = afterAmount || "Unknown";
    return {
      intent:   "LOG_EXPENSE",
      amount,
      merchant,
      category: detectCategory(merchant),
      replyText: "",
    };
  }

  // ── Set goal ──────────────────────────────────────────────────────────────
  if (/^(save|goal|set goal|target|achieve|reach)\b/i.test(raw)) {
    const amount     = parseAmount(raw);
    const difficulty = parseDifficulty(raw);
    const deadline   = parseDeadline(raw);

    let goalType = "SAVINGS";
    if (/spend|budget/i.test(lower))       goalType = "SPENDING_LIMIT";
    else if (/worth/i.test(lower))         goalType = "NET_WORTH";
    else if (/trade|stock|invest/i.test(lower)) goalType = "TRADE_TARGET";

    const title = raw
      .replace(/^(save|goal|set goal|target|achieve|reach)\s*/i, "")
      .replace(/[Rr]\s?\d[\d,. ]*/g, "")
      .replace(/\b(easy|medium|hard|difficult|simple|epic|big|small)\b/gi, "")
      .replace(/\bby\s+\w+/gi, "")
      .trim() || `Save R${amount ?? ""}`;

    return {
      intent:         "SET_GOAL",
      goalTitle:      title || `Savings goal`,
      goalType,
      goalDifficulty: difficulty,
      goalTarget:     amount,
      goalDeadline:   deadline,
      replyText:      "",
    };
  }

  // ── Fuzzy fallbacks ───────────────────────────────────────────────────────
  if (lower.includes("goal") || lower.includes("progress")) {
    return { intent: "QUERY_GOALS", replyText: "" };
  }
  if (lower.includes("spend") || lower.includes("budget") || lower.includes("how am i")) {
    return { intent: "QUERY_SPENDING", replyText: "" };
  }
  if (lower.includes("signal") || lower.includes("trade") || lower.includes("forex")) {
    return { intent: "QUERY_SIGNALS", replyText: "" };
  }
  if (lower.includes("net worth") || lower.includes("networth")) {
    return { intent: "QUERY_NET_WORTH", replyText: "" };
  }

  return {
    intent:    "UNKNOWN",
    replyText: "I didn't catch that. Type *help* to see all commands.",
  };
}