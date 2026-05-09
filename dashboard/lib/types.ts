export type GoalType = "SAVINGS" | "SPENDING_LIMIT" | "NET_WORTH" | "TRADE_TARGET" | "CUSTOM";
export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  type: GoalType;
  difficulty: Difficulty;
  xp_reward: number;
  target_value: number;
  current_value: number;
  deadline: string | null;
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
  id: string;
  user_id: string;
  base_value: number;
  current_value: number;
  yearly_budget_goal: number;
  saved_this_year: number;
  budget_progress_pct: number;
  budget_remaining: number;
  last_updated: string;
}

export interface DailyGoal {
  key: string;
  title: string;
  xp_gain: number;
  xp_loss: number;
  completed: boolean;
  log_id: string | null;
}

export interface DailyStatus {
  date: string;
  goals: DailyGoal[];
  total_xp_today: number;
}

export interface PortfolioTrade {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  exit_price: number | null;
  status: string;
  pnl: number;
  pnl_pct: number;
  is_paper: boolean;
  opened_at: string;
}

export interface PortfolioSummary {
  open_trades: number;
  total_invested: number;
  total_pnl: number;
  total_pnl_pct: number;
  best_trade: string | null;
  worst_trade: string | null;
  trades: PortfolioTrade[];
}

export interface TradingSignal {
  symbol: string;
  price: number | null;
  rsi: number | null;
  macd: number | null;
  score: number;
  signals: string[];
  recommendation: "BUY" | "SELL" | "HOLD" | "ERROR";
  analysed_at: string;
  error: string | null;
}

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  SAVINGS: "Savings", SPENDING_LIMIT: "Spend Limit",
  NET_WORTH: "Net Worth", TRADE_TARGET: "Trade Target", CUSTOM: "Custom",
};

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  EASY:   "text-green border-green/30 bg-green-muted",
  MEDIUM: "text-amber border-amber/30 bg-amber-muted",
  HARD:   "text-red border-red/30 bg-red-muted",
};

export const DIFFICULTY_XP: Record<Difficulty, number> = {
  EASY: 50, MEDIUM: 150, HARD: 300,
};

export const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "#00e5ff", Transport: "#00ff88", "Dining Out": "#ffb300",
  Subscriptions: "#ff4444", Utilities: "#a78bfa", Shopping: "#f472b6",
  Health: "#34d399", Income: "#00ff88", Other: "#5a6474",
};