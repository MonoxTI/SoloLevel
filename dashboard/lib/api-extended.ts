//const BASE = process.env.PYTHON_API_URL ?? "http://localhost:8000";
const BASE = "http://192.168.10.148:8000";
const USER_ID = process.env.NEXT_PUBLIC_DEFAULT_USER_ID ?? "";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function getNetWorthLive(userId = USER_ID) {
  return apiFetch<{
    current_value: number;
    base_value: number;
    yearly_budget_goal: number;
    saved_this_year: number;
    budget_progress_pct: number;
    budget_remaining: number;
  }>(`/finance/net-worth/${userId}`);
}

export async function getDailyStatus(userId = USER_ID) {
  return apiFetch<{
    date: string;
    total_xp_today: number;
    goals: Array<{
      key: string;
      title: string;
      xp_gain: number;
      xp_loss: number;
      completed: boolean;
    }>;
  }>(`/daily-goals/today?user_id=${userId}`);
}

export async function getPortfolioSummary(userId = USER_ID) {
  return apiFetch<{
    open_trades: number;
    total_invested: number;
    total_pnl: number;
    total_pnl_pct: number;
    best_trade: string | null;
    worst_trade: string | null;
  }>(`/finance/trades/${userId}`);
}

export async function getInsights(userId = USER_ID) {
  return apiFetch<Array<{
    id: string;
    type: string;
    severity: string;
    category: string | null;
    title: string;
    body: string;
    value: number | null;
    confidence: number | null;
    read: boolean;
    generated_at: string;
  }>>(`/insights?user_id=${userId}&unread_only=false&limit=10`);
}

export async function getTradingSignals() {
  return apiFetch<Array<{
    symbol: string;
    price: number;
    rsi: number;
    recommendation: string;
    score: number;
    signals: string[];
  }>>("/trading/scan");
}