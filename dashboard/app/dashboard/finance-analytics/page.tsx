"use client";

import { useState, useEffect, useCallback } from "react";

const BASE    = "http://192.168.10.148:8000";
const USER_ID = "c2888153-9809-46f5-840a-35bc1c0bd2a8";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeeklySpend {
  week: string;       // "2026-W01"
  total: number;
  categories: Record<string, number>;
}

interface Insight {
  id: string;
  type: string;
  severity: string;
  category: string | null;
  title: string;
  body: string;
  value: number | null;
  confidence: number | null;
  generated_at: string;
  read: boolean;
}

interface CategorySummary {
  category: string;
  total: number;
}

// ── Bar chart ──────────────────────────────────────────────────────────────────

function WeeklyBarChart({ weeks }: { weeks: WeeklySpend[] }) {
  if (weeks.length === 0) return (
    <div className="flex items-center justify-center h-48 text-muted text-xs">
      No weekly data yet — log some transactions first
    </div>
  );

  const maxVal = Math.max(...weeks.map(w => w.total), 1);
  const W = 600; const H = 160;
  const barWidth = Math.min(40, (W / weeks.length) - 8);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-48" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(pct => (
          <line key={pct}
            x1="0" y1={H - pct * H} x2={W} y2={H - pct * H}
            stroke="var(--color-border)" strokeWidth="0.5" strokeDasharray="4,4" />
        ))}
        {/* Bars */}
        {weeks.map((w, i) => {
          const x = (i / weeks.length) * W + (W / weeks.length - barWidth) / 2;
          const barH = (w.total / maxVal) * (H - 8);
          const y = H - barH;
          const isHighest = w.total === maxVal;
          return (
            <g key={w.week}>
              <rect x={x} y={y} width={barWidth} height={barH}
                fill={isHighest ? "#ff4444" : "#378ADD"} rx="2" opacity="0.85" />
              <text x={x + barWidth / 2} y={H + 14}
                textAnchor="middle" fontSize="8" fill="var(--color-text-tertiary)">
                {w.week.split("-W")[1] ? `W${w.week.split("-W")[1]}` : w.week.slice(-2)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-2 text-[10px]">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#378ADD] inline-block" />Normal week</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red inline-block" />Highest spend</div>
      </div>
    </div>
  );
}

// ── Category breakdown bar ─────────────────────────────────────────────────────

function CategoryBar({ category, amount, max, color }: { category: string; amount: number; max: number; color: string }) {
  const pct = Math.round((amount / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-ink">{category}</span>
        <span className="text-ink-2">R{amount.toLocaleString("en-ZA")} · {pct}%</span>
      </div>
      <div className="h-1.5 bg-bg-4 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  "Groceries":     "#00ff88",
  "Transport":     "#378ADD",
  "Dining Out":    "#EF9F27",
  "Subscriptions": "#A855F7",
  "Utilities":     "#EC4899",
  "Shopping":      "#06B6D4",
  "Health":        "#10B981",
  "Other":         "#6B7280",
};

const SEVERITY_STYLES = {
  high:   { bg: "bg-red-muted",   border: "border-red/30",   text: "text-red",   icon: "⚠️" },
  medium: { bg: "bg-amber-muted", border: "border-amber/30", text: "text-amber", icon: "💡" },
  low:    { bg: "bg-cyan-muted",  border: "border-cyan/30",  text: "text-cyan",  icon: "ℹ️" },
  info:   { bg: "bg-bg-3",        border: "border-border",   text: "text-ink-2", icon: "📊" },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinanceAnalyticsPage() {
  const [weeks, setWeeks]         = useState<WeeklySpend[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [insights, setInsights]   = useState<Insight[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<"weekly" | "categories" | "ml">("weekly");
  const [weeksBack, setWeeksBack] = useState(8);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, ins] = await Promise.all([
        apiFetch<CategorySummary[]>(`/transactions/summary?user_id=${USER_ID}&month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`),
        apiFetch<Insight[]>(`/insights?user_id=${USER_ID}&limit=10`).catch(() => []),
      ]);
      setCategories(cats);
      setInsights(ins);

      // Build weekly data from transactions
      const txns = await apiFetch<any[]>(`/transactions/?user_id=${USER_ID}&limit=200`);
      const weekMap: Record<string, number> = {};
      txns.forEach((t: any) => {
        if (t.amount >= 0) return; // skip income
        const d = new Date(t.date);
        const week = `${d.getFullYear()}-W${String(getWeekNumber(d)).padStart(2, "0")}`;
        weekMap[week] = (weekMap[week] ?? 0) + Math.abs(t.amount);
      });
      const sorted = Object.entries(weekMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-weeksBack)
        .map(([week, total]) => ({ week, total: parseFloat(total.toFixed(2)), categories: {} }));
      setWeeks(sorted);
    } catch (e) {
      console.error("Finance analytics load error:", e);
    } finally {
      setLoading(false);
    }
  }, [weeksBack]);

  useEffect(() => { load(); }, [load]);

  function getWeekNumber(d: Date): number {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  const totalThisMonth  = categories.reduce((s, c) => s + Math.abs(c.total), 0);
  const topCategory     = categories.reduce((a, b) => Math.abs(a.total) > Math.abs(b.total) ? a : b, categories[0]);
  const avgWeeklySpend  = weeks.length > 0 ? weeks.reduce((s, w) => s + w.total, 0) / weeks.length : 0;
  const highInsights    = insights.filter(i => i.severity === "high");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-widest text-ink">FINANCE</h1>
          <p className="text-[11px] text-ink-2 mt-0.5">Spending analytics · ML insights</p>
        </div>
        <button onClick={load}
          className="text-[11px] px-3 py-1.5 rounded border border-border text-ink-2 hover:text-cyan hover:border-cyan/30 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* ML alert banners */}
      {highInsights.length > 0 && (
        <div className="space-y-2">
          {highInsights.map(i => (
            <div key={i.id} className="bg-red-muted border border-red/30 rounded-lg px-4 py-3 flex gap-3">
              <span className="text-lg">⚠️</span>
              <div>
                <div className="text-xs font-semibold text-red">{i.title}</div>
                <div className="text-[11px] text-red/80 mt-0.5">{i.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Spent This Month", value: `R${totalThisMonth.toLocaleString("en-ZA")}`,        accent: "red"   },
          { label: "Avg Weekly Spend", value: `R${avgWeeklySpend.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`, accent: "amber" },
          { label: "Top Category",     value: topCategory?.category ?? "—",                        accent: "ink"   },
          { label: "ML Insights",      value: String(insights.length),                              accent: "cyan"  },
        ].map(s => (
          <div key={s.label} className="bg-bg-2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-ink-2 uppercase tracking-widest mb-1">{s.label}</div>
            <div className={`font-display text-xl tracking-wide truncate ${
              s.accent === "red"   ? "text-red"   :
              s.accent === "amber" ? "text-amber" :
              s.accent === "cyan"  ? "text-cyan"  : "text-ink"
            }`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {(["weekly", "categories", "ml"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[11px] uppercase tracking-widest border-b-2 transition-colors ${
              activeTab === tab
                ? "border-cyan text-cyan"
                : "border-transparent text-ink-2 hover:text-ink"
            }`}>
            {tab === "weekly" ? "Weekly Spend" : tab === "categories" ? "Categories" : "ML Insights"}
          </button>
        ))}
      </div>

      {/* Tab: Weekly spending chart */}
      {activeTab === "weekly" && (
        <div className="bg-bg-2 border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[10px] uppercase tracking-widest text-ink-2">Weekly Spending</h2>
              <p className="text-[10px] text-muted mt-0.5">Expenses only — income excluded</p>
            </div>
            <select
              value={weeksBack}
              onChange={e => setWeeksBack(Number(e.target.value))}
              className="bg-bg-3 border border-border rounded px-2 py-1 text-[10px] text-ink focus:outline-none"
            >
              <option value={4}>Last 4 weeks</option>
              <option value={8}>Last 8 weeks</option>
              <option value={12}>Last 12 weeks</option>
            </select>
          </div>
          {loading ? (
            <div className="h-48 bg-bg-3 rounded animate-pulse" />
          ) : (
            <WeeklyBarChart weeks={weeks} />
          )}

          {/* Week-by-week table */}
          {weeks.length > 0 && (
            <div className="mt-4 space-y-1">
              <div className="grid grid-cols-3 text-[9px] text-muted uppercase tracking-wider px-2 pb-1 border-b border-border">
                <span>Week</span>
                <span className="text-right">Spent</span>
                <span className="text-right">vs avg</span>
              </div>
              {[...weeks].reverse().map(w => {
                const diff = w.total - avgWeeklySpend;
                const pct  = avgWeeklySpend > 0 ? Math.round((diff / avgWeeklySpend) * 100) : 0;
                return (
                  <div key={w.week} className="grid grid-cols-3 px-2 py-1.5 text-xs">
                    <span className="text-ink-2">{w.week}</span>
                    <span className="text-right text-ink">R{w.total.toLocaleString("en-ZA")}</span>
                    <span className={`text-right text-[10px] ${diff > 0 ? "text-red" : "text-green"}`}>
                      {diff > 0 ? "+" : ""}{pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Category breakdown */}
      {activeTab === "categories" && (
        <div className="bg-bg-2 border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] uppercase tracking-widest text-ink-2">
              This Month by Category
            </h2>
            <span className="text-[10px] text-muted">
              Total: R{totalThisMonth.toLocaleString("en-ZA")}
            </span>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-8 bg-bg-3 rounded animate-pulse" />)}
            </div>
          ) : categories.length === 0 ? (
            <p className="text-ink-2 text-sm text-center py-8">No transactions this month yet.</p>
          ) : (
            <div className="space-y-4">
              {[...categories]
                .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
                .map(c => (
                  <CategoryBar
                    key={c.category}
                    category={c.category}
                    amount={Math.abs(c.total)}
                    max={Math.abs(topCategory?.total ?? 1)}
                    color={CATEGORY_COLORS[c.category] ?? "#6B7280"}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: ML Insights */}
      {activeTab === "ml" && (
        <div className="space-y-3">
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-20 bg-bg-2 border border-border rounded-lg animate-pulse" />)}
            </div>
          ) : insights.length === 0 ? (
            <div className="bg-bg-2 border border-border rounded-lg p-8 text-center">
              <p className="text-ink-2 text-sm">No ML insights generated yet.</p>
              <p className="text-muted text-[11px] mt-1">
                The ML engine runs every Sunday at 20:00 SAST — log more transactions to generate insights.
              </p>
            </div>
          ) : (
            insights.map(insight => {
              const style = SEVERITY_STYLES[insight.severity as keyof typeof SEVERITY_STYLES] ?? SEVERITY_STYLES.info;
              return (
                <div key={insight.id} className={`rounded-lg border p-4 ${style.bg} ${style.border}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-lg flex-shrink-0">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className={`text-xs font-semibold ${style.text}`}>{insight.title}</div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {insight.confidence !== null && (
                            <span className="text-[9px] text-muted">
                              {Math.round(insight.confidence * 100)}% confidence
                            </span>
                          )}
                          {insight.category && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${style.border} ${style.text}`}>
                              {insight.category}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-ink-2 leading-relaxed">{insight.body}</p>
                      {insight.value !== null && (
                        <p className={`text-xs font-semibold mt-1 ${style.text}`}>
                          R{Math.abs(insight.value).toLocaleString("en-ZA")}
                        </p>
                      )}
                      <p className="text-[9px] text-muted mt-2">
                        {new Date(insight.generated_at).toLocaleDateString("en-ZA", {
                          day: "numeric", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <p className="text-[10px] text-muted text-center">
            ML engine runs weekly · Uses IsolationForest for anomaly detection · LinearRegression for trend prediction
          </p>
        </div>
      )}
    </div>
  );
}