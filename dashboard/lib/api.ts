import type {
  Goal, GoalType, Difficulty, Transaction, SpendingSummary,
  User, NetWorth, DailyStatus, PortfolioSummary, TradingSignal,
} from "./types";

const BASE = process.env.PYTHON_API_URL ?? "http://localhost:8000";
const USER_ID = process.env.NEXT_PUBLIC_DEFAULT_USER_ID ?? "";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function getUser(userId = USER_ID): Promise<User> {
  return apiFetch(`/users/${userId}`);
}

// ── Goals ─────────────────────────────────────────────────────────────────────
export async function getGoals(userId = USER_ID, completed?: boolean): Promise<Goal[]> {
  const params = new URLSearchParams({ user_id: userId });
  if (completed !== undefined) params.set("completed", String(completed));
  return apiFetch(`/goals/?${params}`);
}

export async function createGoal(body: {
  title: string; type: GoalType; difficulty: Difficulty;
  target_value: number; description?: string;
  deadline?: string; userId?: string;
}): Promise<Goal> {
  return apiFetch("/goals/", {
    method: "POST",
    body: JSON.stringify({ user_id: body.userId ?? USER_ID, ...body }),
  });
}

export async function updateGoalProgress(goalId: string, currentValue: number): Promise<Goal> {
  return apiFetch(`/goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify({ current_value: currentValue }),
  });
}

export async function completeGoal(goalId: string) {
  return apiFetch(`/goals/${goalId}/complete`, { method: "POST" });
}

export async function deleteGoal(goalId: string) {
  return apiFetch(`/goals/${goalId}`, { method: "DELETE" });
}

// ── Transactions ──────────────────────────────────────────────────────────────
export async function getTransactions(userId = USER_ID, limit = 30): Promise<Transaction[]> {
  return apiFetch(`/transactions/?user_id=${userId}&limit=${limit}`);
}

export async function getSpendingSummary(
  userId = USER_ID, month?: number, year?: number
): Promise<SpendingSummary[]> {
  const now = new Date();
  const params = new URLSearchParams({
    user_id: userId,
    month: String(month ?? now.getMonth() + 1),
    year: String(year ?? now.getFullYear()),
  });
  return apiFetch(`/transactions/summary?${params}`);
}

// ── Net Worth ─────────────────────────────────────────────────────────────────
export async function getNetWorth(userId = USER_ID): Promise<NetWorth> {
  return apiFetch(`/finance/net-worth/${userId}`);
}

export async function setNetWorth(userId = USER_ID, baseValue: number, yearlyGoal = 10000): Promise<NetWorth> {
  return apiFetch("/finance/net-worth", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, base_value: baseValue, yearly_budget_goal: yearlyGoal }),
  });
}

// ── Daily Goals ───────────────────────────────────────────────────────────────
export async function getDailyStatus(userId = USER_ID): Promise<DailyStatus> {
  return apiFetch(`/daily-goals/today?user_id=${userId}`);
}

// ── Portfolio ─────────────────────────────────────────────────────────────────
export async function getPortfolio(userId = USER_ID): Promise<PortfolioSummary> {
  return apiFetch(`/finance/trades/${userId}`);
}

// ── Trading Signals ───────────────────────────────────────────────────────────
export async function getTradingSignals(): Promise<TradingSignal[]> {
  return apiFetch("/trading/scan");
}

export async function getSignalForSymbol(symbol: string): Promise<TradingSignal> {
  return apiFetch(`/trading/signal/${symbol}`);
}