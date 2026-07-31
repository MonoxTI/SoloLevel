import type {
  Goal, GoalType, Difficulty, Transaction, SpendingSummary,
  User, NetWorth, DailyStatus, PortfolioSummary, TradingSignal,
} from "./types";

//const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://192.168.10.148:8000";
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

// ── Notes ─────────────────────────────────────────────────────────────────────
export interface Note {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export async function getNotes(userId = USER_ID, notebookId?: string): Promise<Note[]> {
  const params = new URLSearchParams({ user_id: userId }); if (notebookId) params.set("notebook_id", notebookId); return apiFetch(`/notes-todos/notes?${params}`);
}

export async function createNote(content: string, userId = USER_ID, notebookId?: string): Promise<Note> {
  return apiFetch("/notes-todos/notes", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, content, notebook_id: notebookId }),
  });
}

export async function updateNote(noteId: string, content: string): Promise<Note> {
  return apiFetch(`/notes-todos/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export async function deleteNote(noteId: string) {
  return apiFetch(`/notes-todos/notes/${noteId}`, { method: "DELETE" });
}

// ── Todos ─────────────────────────────────────────────────────────────────────
export interface Todo {
  id: string;
  userId: string;
  content: string;
  completed: boolean;
  reminded10h: boolean;
  reminded15h: boolean;
  reminded22h: boolean;
  createdAt: string;
  hoursElapsed: number;
  hoursUntilExpiry: number;
}

export async function getTodos(userId = USER_ID, includeCompleted = false): Promise<Todo[]> {
  return apiFetch(`/notes-todos/todos?user_id=${userId}&include_completed=${includeCompleted}`);
}

export async function createTodo(content: string, userId = USER_ID): Promise<Todo> {
  return apiFetch("/notes-todos/todos", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, content, notebook_id: notebookId }),
  });
}

export async function completeTodo(todoId: string): Promise<Todo> {
  return apiFetch(`/notes-todos/todos/${todoId}/complete`, { method: "POST" });
}

export async function deleteTodo(todoId: string) {
  return apiFetch(`/notes-todos/todos/${todoId}`, { method: "DELETE" });
}

// ── Notebooks ─────────────────────────────────────────────────────────────────
export interface Notebook {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  emoji: string;
  createdAt: string;
  updatedAt: string;
  _count?: { notes: number };
  notes?: Note[];
}

export async function getNotebooks(userId = USER_ID): Promise<Notebook[]> {
  return apiFetch(`/notes-todos/notebooks?user_id=${userId}`);
}

export async function getNotebook(notebookId: string): Promise<Notebook> {
  return apiFetch(`/notes-todos/notebooks/${notebookId}`);
}

export async function createNotebook(data: { name: string; emoji?: string; description?: string }, userId = USER_ID): Promise<Notebook> {
  return apiFetch("/notes-todos/notebooks", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, ...data }),
  });
}

export async function updateNotebook(notebookId: string, data: { name?: string; emoji?: string; description?: string }): Promise<Notebook> {
  return apiFetch(`/notes-todos/notebooks/${notebookId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteNotebook(notebookId: string) {
  return apiFetch(`/notes-todos/notebooks/${notebookId}`, { method: "DELETE" });
}