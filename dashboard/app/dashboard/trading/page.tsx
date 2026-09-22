"use client";

import { useState, useEffect, useCallback } from "react";

const BASE = "http://100.105.161.30:8000";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DerivSummary {
  connected: boolean;
  balance: number;
  currency: string;
  open_trades: number;
  total_pnl: number;
  trades_today: number;
}

interface TradeRecord {
  contract_id: number;
  symbol: string;
  direction: string;
  contract_type: string;
  profit: number;
  buy_price: number;
  sell_price?: number;
  purchase_time?: string;
  expiry_time?: string;
  shortcode?: string;
}

interface PnLPoint {
  label: string;
  cumulative: number;
  trade_pnl: number;
  win: boolean;
}

// ── Mini SVG chart ────────────────────────────────────────────────────────────

function PnLChart({ points }: { points: PnLPoint[] }) {
  if (points.length < 2) return (
    <div className="flex items-center justify-center h-40 text-muted text-xs">
      Not enough trades to chart yet
    </div>
  );

  const W = 600; const H = 160;
  const values = points.map(p => p.cumulative);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const isProfit = values[values.length - 1] >= 0;

  const pts = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - ((p.cumulative - min) / range) * (H - 16) - 8;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  // Zero line
  const zeroY = H - ((0 - min) / range) * (H - 16) - 8;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" preserveAspectRatio="none">
        {/* Zero line */}
        <line x1="0" y1={zeroY} x2={W} y2={zeroY}
          stroke="var(--color-border)" strokeWidth="1" strokeDasharray="4,4" />
        {/* P&L line */}
        <polyline points={pts} fill="none"
          stroke={isProfit ? "#00ff88" : "#ff4444"} strokeWidth="2" />
        {/* Dots for each trade */}
        {points.map((p, i) => {
          const x = (i / (points.length - 1)) * W;
          const y = H - ((p.cumulative - min) / range) * (H - 16) - 8;
          return (
            <circle key={i} cx={x} cy={y} r="3"
              fill={p.win ? "#00ff88" : "#ff4444"} />
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted mt-1">
        <span>Trade 1</span>
        <span>Trade {points.length}</span>
      </div>
    </div>
  );
}

// ── Win rate donut ─────────────────────────────────────────────────────────────

function WinRateDonut({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return (
    <div className="flex items-center justify-center h-24 text-muted text-xs">No trades yet</div>
  );
  const winPct = Math.round((wins / total) * 100);
  const r = 36; const circ = 2 * Math.PI * r;
  const winArc = (wins / total) * circ;

  return (
    <div className="flex items-center gap-4">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--color-background-tertiary)" strokeWidth="10" />
        <circle cx="48" cy="48" r={r} fill="none"
          stroke={winPct >= 50 ? "#00ff88" : "#ff4444"} strokeWidth="10"
          strokeDasharray={`${winArc} ${circ - winArc}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)" />
        <text x="48" y="44" textAnchor="middle" fontSize="14" fontWeight="600"
          fill="var(--color-text-primary)">{winPct}%</text>
        <text x="48" y="58" textAnchor="middle" fontSize="9"
          fill="var(--color-text-tertiary)">win rate</text>
      </svg>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green inline-block" />
          <span className="text-xs text-ink">{wins} wins</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red inline-block" />
          <span className="text-xs text-ink">{losses} losses</span>
        </div>
        <div className="text-[10px] text-muted">{total} total trades</div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TradingAnalyticsPage() {
  const [summary, setSummary]     = useState<DerivSummary | null>(null);
  const [history, setHistory]     = useState<TradeRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, hist] = await Promise.all([
        apiFetch<DerivSummary>("/deriv/summary"),
        apiFetch<{ trades: TradeRecord[] }>(`/deriv/history?limit=${historyLimit}`)
          .then(d => d.trades ?? [])
          .catch(() => []),
      ]);
      setSummary(sum);
      setHistory(hist);
    } catch (e: any) {
      setError("Could not reach the API. Is the Python backend running?");
    } finally {
      setLoading(false);
    }
  }, [historyLimit]);

  useEffect(() => { load(); }, [load]);

  // Build P&L curve from history (oldest first)
  const pnlPoints: PnLPoint[] = [];
  let cumulative = 0;
  [...history].reverse().forEach((t, i) => {
    cumulative += t.profit ?? 0;
    pnlPoints.push({
      label: `#${i + 1}`,
      cumulative: parseFloat(cumulative.toFixed(2)),
      trade_pnl: t.profit ?? 0,
      win: (t.profit ?? 0) > 0,
    });
  });

  const wins   = history.filter(t => (t.profit ?? 0) > 0).length;
  const losses = history.filter(t => (t.profit ?? 0) <= 0).length;
  const totalPnl = history.reduce((s, t) => s + (t.profit ?? 0), 0);
  const avgWin  = wins   > 0 ? history.filter(t => t.profit > 0).reduce((s, t) => s + t.profit, 0) / wins   : 0;
  const avgLoss = losses > 0 ? history.filter(t => t.profit <= 0).reduce((s, t) => s + t.profit, 0) / losses : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-widest text-ink">TRADING</h1>
          <p className="text-[11px] text-ink-2 mt-0.5">Deriv · Volatility 25 Index · Auto algo</p>
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <div className={`flex items-center gap-1.5 text-[11px] px-3 py-1 rounded border ${
              summary.connected
                ? "text-green border-green/30 bg-green-muted"
                : "text-red border-red/30 bg-red-muted"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${summary.connected ? "bg-green" : "bg-red"}`} />
              {summary.connected ? "Connected" : "Disconnected"}
            </div>
          )}
          <button onClick={load}
            className="text-[11px] px-3 py-1.5 rounded border border-border text-ink-2 hover:text-cyan hover:border-cyan/30 transition-colors">
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-muted border border-red/30 rounded-lg px-4 py-3 text-[11px] text-red">
          {error}
        </div>
      )}

      {/* Account stats */}
      {summary?.connected && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Balance",      value: `$${summary.balance?.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, accent: "cyan"  },
            { label: "Open P&L",     value: `${(summary.total_pnl ?? 0) >= 0 ? "+" : ""}$${(summary.total_pnl ?? 0).toFixed(2)}`, accent: (summary.total_pnl ?? 0) >= 0 ? "green" : "red" },
            { label: "Open Trades",  value: String(summary.open_trades ?? 0),  accent: "ink"   },
            { label: "Trades Today", value: String(summary.trades_today ?? 0), accent: "amber" },
          ].map(s => (
            <div key={s.label} className="bg-bg-2 border border-border rounded-lg p-3">
              <div className="text-[10px] text-ink-2 uppercase tracking-widest mb-1">{s.label}</div>
              <div className={`font-display text-xl tracking-wide ${
                s.accent === "green" ? "text-green" :
                s.accent === "red"   ? "text-red"   :
                s.accent === "cyan"  ? "text-cyan"  :
                s.accent === "amber" ? "text-amber"  : "text-ink"
              }`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* P&L Chart */}
      <div className="bg-bg-2 border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[10px] uppercase tracking-widest text-ink-2">Profit & Loss Curve</h2>
            <p className="text-[10px] text-muted mt-0.5">Cumulative P&L across {history.length} closed trades</p>
          </div>
          <div className={`font-display text-lg ${totalPnl >= 0 ? "text-green" : "text-red"}`}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </div>
        </div>
        {loading ? (
          <div className="h-40 bg-bg-3 rounded animate-pulse" />
        ) : (
          <PnLChart points={pnlPoints} />
        )}
      </div>

      {/* Win rate + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Win rate donut */}
        <div className="bg-bg-2 border border-border rounded-lg p-4">
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2 mb-4">Win Rate</h2>
          {loading ? (
            <div className="h-24 bg-bg-3 rounded animate-pulse" />
          ) : (
            <WinRateDonut wins={wins} losses={losses} />
          )}
        </div>

        {/* Trade stats */}
        <div className="bg-bg-2 border border-border rounded-lg p-4">
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2 mb-4">Trade Statistics</h2>
          <div className="space-y-3">
            {[
              { label: "Total P&L",    value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? "text-green" : "text-red" },
              { label: "Avg Win",      value: wins > 0 ? `+$${avgWin.toFixed(2)}`   : "—", color: "text-green" },
              { label: "Avg Loss",     value: losses > 0 ? `$${avgLoss.toFixed(2)}` : "—", color: "text-red"   },
              { label: "Profit Factor",
                value: losses !== 0 && avgLoss !== 0
                  ? (Math.abs(avgWin * wins) / Math.abs(avgLoss * losses)).toFixed(2)
                  : "—",
                color: "text-ink" },
              { label: "Total Trades", value: String(history.length), color: "text-ink" },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-xs text-ink-2">{s.label}</span>
                <span className={`text-sm font-semibold ${s.color}`}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trade history table */}
      <div className="bg-bg-2 border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2">
            Trade History ({history.length})
          </h2>
          <select
            value={historyLimit}
            onChange={e => setHistoryLimit(Number(e.target.value))}
            className="bg-bg-3 border border-border rounded px-2 py-1 text-[10px] text-ink focus:outline-none"
          >
            <option value={10}>Last 10</option>
            <option value={20}>Last 20</option>
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
          </select>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-bg-3 rounded animate-pulse" />)}
          </div>
        ) : history.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-ink-2 text-sm">No closed trades yet.</p>
            <p className="text-muted text-[11px] mt-1">
              Hit <span className="text-cyan">POST /deriv/scan</span> to trigger the algo.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2 px-4 py-2 text-[9px] text-muted uppercase tracking-wider border-b border-border">
              <span>Symbol</span>
              <span>Direction</span>
              <span className="text-right">Stake</span>
              <span className="text-right">P&L</span>
              <span className="text-right">Result</span>
            </div>
            {history.map((t, i) => (
              <div key={t.contract_id ?? i}
                className={`grid grid-cols-5 gap-2 px-4 py-3 text-xs items-center ${i > 0 ? "border-t border-border" : ""}`}>
                <span className="text-ink font-medium">{t.symbol}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] border w-fit font-semibold ${
                  t.direction === "BUY"
                    ? "text-green bg-green-muted border-green/30"
                    : "text-red bg-red-muted border-red/30"
                }`}>{t.direction}</span>
                <span className="text-right text-ink-2">${(t.buy_price ?? 0).toFixed(2)}</span>
                <span className={`text-right font-semibold ${(t.profit ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                  {(t.profit ?? 0) >= 0 ? "+" : ""}${(t.profit ?? 0).toFixed(2)}
                </span>
                <span className={`text-right text-[10px] font-medium ${(t.profit ?? 0) > 0 ? "text-green" : "text-red"}`}>
                  {(t.profit ?? 0) > 0 ? "WIN" : "LOSS"}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Manual trigger */}
      <div className="flex justify-end">
        <button
          onClick={async () => {
            try {
              const r = await fetch(`${BASE}/deriv/scan`, { method: "POST" });
              const d = await r.json();
              alert(`Scan complete — ${d.trades_placed ?? 0} trade(s) placed`);
              load();
            } catch { alert("Scan failed — check the API is running"); }
          }}
          className="px-5 py-2 rounded border border-cyan/30 text-cyan text-[11px] hover:bg-cyan/10 transition-colors"
        >
          ▶ Trigger Manual Scan
        </button>
      </div>
    </div>
  );
}