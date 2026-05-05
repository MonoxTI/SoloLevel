export type GoalType =
  | "SAVINGS"
  | "SPENDING_LIMIT"
  | "NET_WORTH"
  | "TRADE_TARGET"
  | "CUSTOM";

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  type: GoalType;
  target_value: number;
  current_value: number;
  deadline: string | null;
  xp_reward: number;
  completed: boolean;
  progress_pct: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  category: string;
  merchant: string | null;
  note: string | null;
  date: string;
}

export interface SpendingSummary {
  category: string;
  total: number;
  count: number;
}

export interface User {
  id: string;
  name: string;
  xp: number;
  level: number;
  streak: number;
  last_active: string | null;
  created_at: string;
}

export interface NetWorth {
  user_id: string;
  cash_balance: number;
  total_spent_30d: number;
  total_income_30d: number;
  net_30d: number;
  estimated_net_worth: number;
  calculated_at: string;
}

// UI-only helpers
export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  SAVINGS: "Savings",
  SPENDING_LIMIT: "Spend Limit",
  NET_WORTH: "Net Worth",
  TRADE_TARGET: "Trade Target",
  CUSTOM: "Custom",
};

export const GOAL_TYPE_COLORS: Record<GoalType, string> = {
  SAVINGS: "text-green border-green/30 bg-green-muted",
  SPENDING_LIMIT: "text-red border-red/30 bg-red-muted",
  NET_WORTH: "text-cyan border-cyan/30 bg-cyan-muted",
  TRADE_TARGET: "text-amber border-amber/30 bg-amber-muted",
  CUSTOM: "text-ink-2 border-border bg-bg-4",
};

export const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "#00e5ff",
  Transport: "#00ff88",
  "Dining Out": "#ffb300",
  Subscriptions: "#ff4444",
  Utilities: "#a78bfa",
  Shopping: "#f472b6",
  Health: "#34d399",
  Other: "#5a6474",
};