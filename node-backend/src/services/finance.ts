import axios from "axios";
import { config } from "../config";

const api = axios.create({ baseURL: config.pythonApiUrl });

// ── Transactions ──────────────────────────────────────────────────────────────
export async function logTransaction(params: {
  userId: string; amount: number; merchant: string; category?: string; note?: string;
}) {
  const { data } = await api.post("/transactions/", {
    user_id: params.userId,
    amount: -Math.abs(params.amount),  // positive = expense
    merchant: params.merchant,
    category: params.category,
    note: params.note,
  });
  return data;
}

export async function logIncome(params: {
  userId: string; amount: number; merchant: string;
}) {
  const { data } = await api.post("/transactions/", {
    user_id: params.userId,
    amount: Math.abs(params.amount),  // negative = income
    merchant: params.merchant,
    category: "Income",
  });
  return data;
}

export async function getSpendingSummary(userId: string) {
  const now = new Date();
  const { data } = await api.get("/transactions/summary", {
    params: { user_id: userId, month: now.getMonth() + 1, year: now.getFullYear() },
  });
  return data;
}

// ── Goals ─────────────────────────────────────────────────────────────────────
export async function getGoals(userId: string, completed?: boolean) {
  const params: Record<string, string> = { user_id: userId };
  if (completed !== undefined) params.completed = String(completed);
  const { data } = await api.get("/goals/", { params });
  return data;
}

export async function createGoal(params: {
  userId: string; title: string; type: string;
  difficulty: string; targetValue: number; deadline?: string;
}) {
  const { data } = await api.post("/goals/", {
    user_id: params.userId, title: params.title,
    type: params.type, difficulty: params.difficulty,
    target_value: params.targetValue, deadline: params.deadline ?? null,
  });
  return data;
}

// ── Daily Goals ───────────────────────────────────────────────────────────────
export async function getDailyStatus(userId: string) {
  const { data } = await api.get("/daily-goals/today", { params: { user_id: userId } });
  return data;
}

export async function completeDailyGoal(userId: string, goalKey: string) {
  const { data } = await api.post(`/daily-goals/${goalKey}/complete`, null, {
    params: { user_id: userId },
  });
  return data;
}

// ── Net Worth ─────────────────────────────────────────────────────────────────
export async function setNetWorth(params: {
  userId: string; baseValue: number; yearlyBudgetGoal?: number;
}) {
  const { data } = await api.post("/finance/net-worth", {
    user_id: params.userId,
    base_value: params.baseValue,
    yearly_budget_goal: params.yearlyBudgetGoal ?? 10000,
  });
  return data;
}

export async function getNetWorth(userId: string) {
  const { data } = await api.get(`/finance/net-worth/${userId}`);
  return data;
}

// ── Trading ───────────────────────────────────────────────────────────────────
export async function getTradingSignal(symbol?: string) {
  if (symbol) {
    const { data } = await api.get(`/trading/signal/${symbol}`);
    return [data];
  }
  const { data } = await api.get("/trading/scan");
  return data;
}

export async function getPortfolio(userId: string) {
  const { data } = await api.get(`/finance/trades/${userId}`);
  return data;
}