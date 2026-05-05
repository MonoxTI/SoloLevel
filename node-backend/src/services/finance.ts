import axios from "axios";
import { config } from "../config";

const api = axios.create({ baseURL: config.pythonApiUrl });

export async function logTransaction(params: {
  userId: string;
  amount: number;
  merchant: string;
  category?: string;
  note?: string;
}) {
  const { data } = await api.post("/transactions/", {
    user_id: params.userId,
    amount: params.amount,
    merchant: params.merchant,
    category: params.category,
    note: params.note,
  });
  return data;
}

export async function getGoals(userId: string, completed?: boolean) {
  const params: Record<string, string> = { user_id: userId };
  if (completed !== undefined) params.completed = String(completed);
  const { data } = await api.get("/goals/", { params });
  return data;
}

export async function createGoal(params: {
  userId: string;
  title: string;
  type: string;
  targetValue: number;
  deadline?: string;
  xpReward?: number;
}) {
  const { data } = await api.post("/goals/", {
    user_id: params.userId,
    title: params.title,
    type: params.type,
    target_value: params.targetValue,
    deadline: params.deadline ?? null,
    xp_reward: params.xpReward ?? 100,
  });
  return data;
}

export async function getSpendingSummary(userId: string) {
  const now = new Date();
  const { data } = await api.get("/transactions/summary", {
    params: {
      user_id: userId,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    },
  });
  return data as Array<{ category: string; total: number; count: number }>;
}