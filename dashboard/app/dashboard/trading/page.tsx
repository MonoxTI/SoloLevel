"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { formatZAR } from "@/lib/utils";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MT5Status {
  connected: boolean;
  reason?: string;
  account?: {
    balance: number;
    equity: number;
    profit: number;
    free_margin: number;
    currency: string;
  };
}

interface Position {
  ticket: number;
  symbol: string;
  direction: "BUY" | "SELL";
  volume: number;
  open_price: number;
  sl: number;
  tp: number;
  profit: number;
  open_time: string;
}

interface Signal {
  symbol: string;
  price: number | null;
  signal: "BUY" | "SELL" | "HOLD" | "ERROR";
  confidence: number;
  score: number;
  agreeing_strategies: number;
  atr: number | null;
  trade_setup: {
    direction: string;
    entry: number;
    stop_loss: number;
    take_profit: number;
    lot_size: number;
    risk_amount: number;
    rr_ratio: number;
    strategy: string;
    atr: number;
  } | null;
  risk_check: { approved: boolean; reason: string } | null;
  strategies: Record<string, {
    signal: string;
    confidence: number;
    timeframe: string;
    details: string;
  }>;
  analysed_at: string;
  error: string | null;
  engine?: string;
}

interface StrategyPerf {
  name: string;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_pnl: number;
  weight: number;
}

interface BacktestResult {
  symbol: string;
  period: string;
  initial_balance: number;
  final_balance: number;
  total_return_pct: number;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit_factor: number;
  max_drawdown_pct: number;
  equity_curve: { date: string; balance: number }[];
  strategy_breakdown: Record<string, { wins: number; losses: number; win_rate: number }>;
  error?: string;
}

// ── Style maps ────────────────────────────────────────────────────────────────

const SIG_STYLES = {
  BUY:   { border: "border-l-green",  badge: "text-green  bg-green-muted  border-green/30",  icon: "▲" },
  SELL:  { border: "border-l-red",    badge: "text-red    bg-red-muted    border-red/30",    icon: "▼" },
  HOLD:  { border: "border-l-amber",  badge: "text-amber  bg-amber-muted  border-amber/30", icon: "◆" },
  ERROR: { border: "border-border",   badge: "text-muted  bg-bg-4         border-border",   icon: "?" },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 text-[11px] uppercase tracking-widest border-b-2 transition-colors",
        active
          ? "border-cyan text-cyan"
          : "border-transparent text-ink-2 hover:text-ink"
      )}
    >
      {label}
    </button>
  );
}

function LoadingRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex gap-3 px-4 py-3 animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="h-3 bg-bg-4 rounded flex-1" />
      ))}
    </div>
  );
}

// ── Tab: Live ─────────────────────────────────────────────────────────────────

function LiveTab() {
  const [status, setStatus]     = useState<MT5Status | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading]   = useState(true);
  const [closing, setClosing]   = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        apiFetch<MT5Status>("/forex/mt5/status"),
        apiFetch<{ positions: Position[] }>("/forex/mt5/positions").then(d => d.positions),
      ]);
      setStatus(s);
      setPositions(p as Position[]);
    } catch { setStatus({ connected: false, reason: "API unreachable" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerScan = async () => {
    try {
      await fetch(`${API}/forex/mt5/scan`, { method: "POST" });
      setTimeout(load, 2000);
    } catch {}
  };

  const closePosition = async (ticket: number) => {
    setClosing(ticket);
    try {
      await fetch(`${API}/forex/mt5/close/${ticket}`, { method: "POST" });
      await load();
    } catch {}
    finally { setClosing(null); }
  };

  const isConnected = status?.connected === true;
  const account     = status?.account;
  const totalPnl    = positions.reduce((s, p) => s + p.profit, 0);

  return (
    <div className="space-y-4">
      {/* Connection banner */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 rounded-lg border text-[11px]",
        isConnected
          ? "bg-green-muted border-green/30 text-green"
          : "bg-red-muted   border-red/30   text-red"
      )}>
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full", isConnected ? "bg-green shadow-[0_0_6px_#00ff88]" : "bg-red")} />
          {isConnected ? "MT5 Connected — HF Markets Demo" : `MT5 Disconnected${status?.reason ? ` · ${status.reason}` : ""}`}
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              onClick={triggerScan}
              className="px-3 py-1 rounded border border-green/30 hover:bg-green/10 transition-colors text-[10px]"
            >
              Force Scan
            </button>
          )}
          <button onClick={load} className="px-3 py-1 rounded border border-current/30 hover:opacity-80 transition-opacity text-[10px]">
            Refresh
          </button>
        </div>
      </div>

      {/* Account stats */}
      {account && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Balance",     value: formatZAR(account.balance),     accent: "cyan"  },
            { label: "Equity",      value: formatZAR(account.equity),      accent: "ink"   },
            { label: "Open P&L",    value: `${totalPnl >= 0 ? "+" : ""}${formatZAR(totalPnl)}`,
              accent: totalPnl >= 0 ? "green" : "red" },
            { label: "Free Margin", value: formatZAR(account.free_margin), accent: "ink"   },
          ].map(s => (
            <div key={s.label} className="bg-bg-2 border border-border rounded-lg p-3">
              <div className="text-[10px] text-ink-2 uppercase tracking-widest mb-1">{s.label}</div>
              <div className={cn("font-display text-xl tracking-wide",
                s.accent === "green" ? "text-green" :
                s.accent === "red"   ? "text-red"   :
                s.accent === "cyan"  ? "text-cyan"  : "text-ink"
              )}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Open positions */}
      <div className="bg-bg-2 border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2">
            Open Positions ({positions.length})
          </h2>
          {positions.length > 0 && (
            <span className={cn("text-[11px] font-medium", totalPnl >= 0 ? "text-green" : "text-red")}>
              {totalPnl >= 0 ? "+" : ""}{formatZAR(totalPnl)}
            </span>
          )}
        </div>

        {loading ? (
          <><LoadingRow /><LoadingRow /><LoadingRow /></>
        ) : positions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-ink-2 text-xs">No open positions</p>
            <p className="text-muted text-[11px] mt-1">
              {isConnected ? "The algo will place trades when signals align." : "Connect MT5 first."}
            </p>
          </div>
        ) : (
          positions.map((pos, i) => (
            <div key={pos.ticket} className={cn("flex items-center justify-between px-4 py-3", i > 0 && "border-t border-border")}>
              <div className="flex items-center gap-3">
                <span className={cn("text-[10px] px-2 py-0.5 rounded border font-semibold",
                  pos.direction === "BUY" ? "text-green bg-green-muted border-green/30" : "text-red bg-red-muted border-red/30"
                )}>
                  {pos.direction}
                </span>
                <div>
                  <div className="text-xs text-ink font-medium">{pos.symbol}</div>
                  <div className="text-[10px] text-muted">{pos.volume} lots · Entry {pos.open_price}</div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] text-muted">SL <span className="text-red">{pos.sl || "—"}</span></div>
                  <div className="text-[10px] text-muted">TP <span className="text-green">{pos.tp || "—"}</span></div>
                </div>
                <div className="text-right">
                  <div className={cn("text-sm font-semibold font-display", pos.profit >= 0 ? "text-green" : "text-red")}>
                    {pos.profit >= 0 ? "+" : ""}{formatZAR(pos.profit)}
                  </div>
                  <div className="text-[10px] text-muted">#{pos.ticket}</div>
                </div>
                <button
                  onClick={() => closePosition(pos.ticket)}
                  disabled={closing === pos.ticket}
                  className="text-[10px] px-2 py-1 rounded border border-red/30 text-red hover:bg-red-muted transition-colors disabled:opacity-50"
                >
                  {closing === pos.ticket ? "..." : "Close"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {!isConnected && (
        <div className="bg-bg-2 border border-amber/30 rounded-lg p-4 text-[11px] text-amber">
          ⚠️ Open MetaTrader 5 → log into HF Markets Demo (account 57447432) → restart uvicorn
        </div>
      )}
    </div>
  );
}

// ── Tab: Signals ──────────────────────────────────────────────────────────────

function SignalsTab() {
  const [signals, setSignals]     = useState<Signal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [scanning, setScanning]   = useState(false);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [filter, setFilter]       = useState<"ALL" | "BUY" | "SELL" | "HOLD">("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Signal[]>("/forex/scan");
      setSignals(data);
    } catch { setSignals([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rescan = async () => {
    setScanning(true);
    await load();
    setScanning(false);
  };

  const visible = filter === "ALL" ? signals : signals.filter(s => s.signal === filter);
  const counts  = { BUY: signals.filter(s => s.signal === "BUY").length, SELL: signals.filter(s => s.signal === "SELL").length, HOLD: signals.filter(s => s.signal === "HOLD").length };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1">
          {(["ALL", "BUY", "HOLD", "SELL"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={cn(
              "px-3 py-1 rounded text-[10px] uppercase tracking-wider border transition-colors",
              filter === f
                ? f === "BUY"  ? "bg-green-muted  border-green/30  text-green"
                : f === "SELL" ? "bg-red-muted    border-red/30    text-red"
                : f === "HOLD" ? "bg-amber-muted  border-amber/30  text-amber"
                :                "bg-cyan-muted   border-cyan/30   text-cyan"
                : "border-border text-ink-2 hover:text-ink"
            )}>
              {f}{f !== "ALL" ? ` (${counts[f]})` : ` (${signals.length})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {signals[0]?.analysed_at && (
            <span className="text-[10px] text-muted">
              {new Date(signals[0].analysed_at).toLocaleTimeString("en-ZA")}
            </span>
          )}
          <button onClick={rescan} disabled={scanning || loading} className="px-3 py-1.5 rounded border border-cyan/30 text-cyan text-[11px] hover:bg-cyan/10 transition-colors disabled:opacity-50">
            {scanning ? "Scanning…" : "↻ Rescan"}
          </button>
        </div>
      </div>

      {/* Signal cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5].map(i => <div key={i} className="bg-bg-2 border border-border rounded-lg h-36 animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-bg-2 border border-border rounded-lg p-8 text-center">
          <p className="text-ink-2 text-sm">No {filter !== "ALL" ? filter : ""} signals</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(sig => {
            const style = SIG_STYLES[sig.signal] ?? SIG_STYLES.ERROR;
            const isOpen = expanded === sig.symbol;
            return (
              <div
                key={sig.symbol}
                className={cn("bg-bg-2 border border-border border-l-2 rounded-lg p-4 cursor-pointer transition-colors hover:border-border/80", style.border)}
                onClick={() => setExpanded(isOpen ? null : sig.symbol)}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-ink font-semibold text-sm">{sig.symbol}</div>
                    <div className="text-ink-2 text-[11px] mt-0.5">{sig.price?.toFixed(5) ?? "—"}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded border font-semibold", style.badge)}>
                      {style.icon} {sig.signal}
                    </span>
                    {sig.confidence > 0 && (
                      <span className="text-[9px] text-muted">{(sig.confidence * 100).toFixed(0)}% conf</span>
                    )}
                  </div>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: "Score",  value: sig.score > 0 ? `+${sig.score.toFixed(2)}` : sig.score.toFixed(2),
                      color: sig.score > 0 ? "text-green" : sig.score < 0 ? "text-red" : "text-ink" },
                    { label: "Agree",  value: `${sig.agreeing_strategies}/4`, color: "text-ink" },
                    { label: "ATR",    value: sig.atr?.toFixed(4) ?? "—",     color: "text-muted" },
                  ].map(s => (
                    <div key={s.label} className="bg-bg-3 rounded p-2 text-center">
                      <div className="text-[9px] text-muted uppercase mb-0.5">{s.label}</div>
                      <div className={cn("text-xs font-semibold", s.color)}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Trade setup */}
                {sig.trade_setup && sig.risk_check?.approved && (
                  <div className="bg-bg-3 rounded p-2 text-[10px] space-y-1 mb-2">
                    <div className="text-ink-2 uppercase tracking-wider text-[9px] mb-1">Trade Setup</div>
                    {[
                      ["Entry",  sig.trade_setup.entry,       "text-ink"],
                      ["SL",     sig.trade_setup.stop_loss,   "text-red"],
                      ["TP",     sig.trade_setup.take_profit, "text-green"],
                      ["Lots",   sig.trade_setup.lot_size,    "text-ink"],
                      ["Risk",   formatZAR(sig.trade_setup.risk_amount), "text-amber"],
                      ["R:R",    `1:${sig.trade_setup.rr_ratio}`,        "text-ink"],
                    ].map(([label, val, col]) => (
                      <div key={label as string} className="flex justify-between">
                        <span className="text-muted">{label}</span>
                        <span className={col as string}>{val as string}</span>
                      </div>
                    ))}
                  </div>
                )}
                {sig.risk_check && !sig.risk_check.approved && sig.trade_setup && (
                  <div className="text-[10px] text-amber">⚠ {sig.risk_check.reason}</div>
                )}

                {/* Expanded: per-strategy breakdown */}
                {isOpen && Object.entries(sig.strategies).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <div className="text-[9px] text-muted uppercase tracking-wider">Strategy breakdown</div>
                    {Object.entries(sig.strategies).map(([name, s]) => (
                      <div key={name} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] text-ink truncate">{name}</div>
                          <div className="text-[9px] text-muted truncate">{s.details}</div>
                        </div>
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded border flex-shrink-0",
                          s.signal === "BUY"  ? "text-green bg-green-muted border-green/30" :
                          s.signal === "SELL" ? "text-red   bg-red-muted   border-red/30"   :
                                                "text-muted bg-bg-4        border-border"
                        )}>
                          {s.signal}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {sig.error && <div className="text-[10px] text-red mt-1">{sig.error}</div>}

                <div className="text-[9px] text-muted mt-2 text-right">
                  {isOpen ? "▲ collapse" : "▼ expand strategies"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Performance ──────────────────────────────────────────────────────────

function PerformanceTab() {
  const [strategies, setStrategies] = useState<StrategyPerf[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    apiFetch<{ strategies: StrategyPerf[] }>("/forex/performance")
      .then(d => setStrategies(d.strategies))
      .catch(() => setStrategies([]))
      .finally(() => setLoading(false));
  }, []);

  const totalTrades = strategies.reduce((s, r) => s + r.total_trades, 0);
  const totalWins   = strategies.reduce((s, r) => s + r.wins,         0);
  const overallWR   = totalTrades > 0 ? totalWins / totalTrades : 0;

  return (
    <div className="space-y-4">
      {/* Overall stat */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Trades",  value: totalTrades.toString(),             accent: "ink"  },
          { label: "Overall W/R",   value: `${(overallWR * 100).toFixed(1)}%`, accent: overallWR >= 0.5 ? "green" : "red" },
          { label: "Total Wins",    value: `${totalWins} / ${totalTrades}`,    accent: "cyan" },
        ].map(s => (
          <div key={s.label} className="bg-bg-2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-ink-2 uppercase tracking-widest mb-1">{s.label}</div>
            <div className={cn("font-display text-xl", s.accent === "green" ? "text-green" : s.accent === "red" ? "text-red" : s.accent === "cyan" ? "text-cyan" : "text-ink")}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Per-strategy table */}
      <div className="bg-bg-2 border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2">Strategy Performance</h2>
        </div>

        {loading ? (
          <><LoadingRow cols={5} /><LoadingRow cols={5} /><LoadingRow cols={5} /><LoadingRow cols={5} /></>
        ) : totalTrades === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-ink-2 text-xs">No completed trades yet</p>
            <p className="text-muted text-[11px] mt-1">Performance data builds up after the algo has placed and closed trades.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-3 px-4 py-2 text-[9px] text-muted uppercase tracking-wider border-b border-border">
              <span className="col-span-2">Strategy</span>
              <span className="text-right">Trades</span>
              <span className="text-right">Win Rate</span>
              <span className="text-right">Weight</span>
            </div>
            {strategies.map(s => {
              const wr = s.win_rate;
              return (
                <div key={s.name} className="grid grid-cols-5 gap-3 px-4 py-3 border-t border-border items-center">
                  <div className="col-span-2">
                    <div className="text-xs text-ink">{s.name}</div>
                    <div className="text-[10px] text-muted">{s.wins}W / {s.losses}L</div>
                  </div>
                  <div className="text-right text-xs text-ink">{s.total_trades}</div>
                  <div className="text-right">
                    {s.total_trades < 10 ? (
                      <span className="text-[10px] text-muted">—</span>
                    ) : (
                      <span className={cn("text-xs font-semibold", wr >= 0.6 ? "text-green" : wr < 0.4 ? "text-red" : "text-amber")}>
                        {(wr * 100).toFixed(1)}%
                      </span>
                    )}
                    {/* Win-rate bar */}
                    {s.total_trades >= 10 && (
                      <div className="h-1 bg-bg-4 rounded-full mt-1 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full", wr >= 0.6 ? "bg-green" : wr < 0.4 ? "bg-red" : "bg-amber")}
                          style={{ width: `${wr * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={cn("text-xs", s.weight > 1 ? "text-green" : s.weight < 1 ? "text-red" : "text-ink")}>
                      ×{s.weight.toFixed(2)}
                    </span>
                    <div className="text-[9px] text-muted">{s.total_trades < 10 ? "building" : s.weight > 1 ? "boosted" : s.weight < 1 ? "reduced" : "neutral"}</div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <p className="text-[10px] text-muted">
        Weights adjust automatically after 10+ trades: win rate &gt;60% boosts a strategy, &lt;40% reduces it.
      </p>
    </div>
  );
}

// ── Tab: Backtest ─────────────────────────────────────────────────────────────

const PAIRS = ["EURUSD", "GBPUSD", "USDZAR", "XAUUSD", "USDJPY", "AUDUSD", "EURZAR"];
const PERIODS = ["3mo", "6mo", "1y"];

function BacktestTab() {
  const [symbol, setSymbol]   = useState("EURUSD");
  const [period, setPeriod]   = useState("6mo");
  const [balance, setBalance] = useState("10000");
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState<BacktestResult | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const data = await apiFetch<BacktestResult>(
        `/forex/backtest/${symbol}?period=${period}&initial_balance=${balance}`
      );
      if (data.error) setError(data.error);
      else setResult(data);
    } catch (e: any) {
      setError(e.message ?? "Backtest failed");
    } finally {
      setRunning(false);
    }
  };

  // Simple SVG equity curve
  const EquityCurve = ({ curve }: { curve: { date: string; balance: number }[] }) => {
    if (curve.length < 2) return null;
    const W = 600; const H = 120;
    const min = Math.min(...curve.map(p => p.balance));
    const max = Math.max(...curve.map(p => p.balance));
    const range = max - min || 1;
    const pts = curve.map((p, i) => {
      const x = (i / (curve.length - 1)) * W;
      const y = H - ((p.balance - min) / range) * (H - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const isUp = curve[curve.length - 1].balance >= curve[0].balance;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={isUp ? "#00ff88" : "#ff4444"} strokeWidth="1.5" />
      </svg>
    );
  };

  return (
    <div className="space-y-4">
      {/* Config */}
      <div className="bg-bg-2 border border-border rounded-lg p-4">
        <h2 className="text-[10px] uppercase tracking-widest text-ink-2 mb-4">Backtest Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wider block mb-1.5">Pair</label>
            <select
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              className="w-full bg-bg-3 border border-border rounded px-3 py-2 text-xs text-ink focus:border-cyan/50 focus:outline-none"
            >
              {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wider block mb-1.5">Period</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="w-full bg-bg-3 border border-border rounded px-3 py-2 text-xs text-ink focus:border-cyan/50 focus:outline-none"
            >
              {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted uppercase tracking-wider block mb-1.5">Starting Balance (USD)</label>
            <input
              type="number"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              className="w-full bg-bg-3 border border-border rounded px-3 py-2 text-xs text-ink focus:border-cyan/50 focus:outline-none"
            />
          </div>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="px-5 py-2 rounded border border-cyan/30 text-cyan text-[11px] hover:bg-cyan/10 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {running && <span className="w-3 h-3 border border-cyan/50 border-t-cyan rounded-full animate-spin" />}
          {running ? `Running ${symbol} ${period}…` : "▶ Run Backtest"}
        </button>
        <p className="text-[10px] text-muted mt-2">Takes 10–30s — fetches historical data then simulates every hourly candle.</p>
      </div>

      {error && (
        <div className="bg-red-muted border border-red/30 rounded-lg px-4 py-3 text-[11px] text-red">
          ❌ {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total Return",   value: `${result.total_return_pct >= 0 ? "+" : ""}${result.total_return_pct.toFixed(1)}%`,
                accent: result.total_return_pct >= 0 ? "green" : "red" },
              { label: "Win Rate",       value: `${(result.win_rate * 100).toFixed(1)}%`,
                accent: result.win_rate >= 0.5 ? "green" : "red" },
              { label: "Profit Factor",  value: result.profit_factor.toFixed(2),
                accent: result.profit_factor >= 1.5 ? "green" : result.profit_factor < 1 ? "red" : "amber" },
              { label: "Max Drawdown",   value: `${result.max_drawdown_pct.toFixed(1)}%`,
                accent: result.max_drawdown_pct < 10 ? "green" : result.max_drawdown_pct > 20 ? "red" : "amber" },
            ].map(s => (
              <div key={s.label} className="bg-bg-2 border border-border rounded-lg p-3">
                <div className="text-[10px] text-ink-2 uppercase tracking-widest mb-1">{s.label}</div>
                <div className={cn("font-display text-xl",
                  s.accent === "green" ? "text-green" : s.accent === "red" ? "text-red" : s.accent === "amber" ? "text-amber" : "text-ink"
                )}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Trade count row */}
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-ink-2">
              {result.total_trades} trades over {result.period}
            </span>
            <span className="text-green">{result.wins} wins</span>
            <span className="text-red">{result.losses} losses</span>
            <span className="text-ink-2 ml-auto">
              {formatZAR(result.initial_balance)} → {formatZAR(result.final_balance)}
            </span>
          </div>

          {/* Equity curve */}
          {result.equity_curve.length > 1 && (
            <div className="bg-bg-2 border border-border rounded-lg p-4">
              <div className="text-[10px] text-ink-2 uppercase tracking-widest mb-3">Equity Curve</div>
              <EquityCurve curve={result.equity_curve} />
              <div className="flex justify-between text-[10px] text-muted mt-1">
                <span>{new Date(result.equity_curve[0].date).toLocaleDateString("en-ZA")}</span>
                <span>{new Date(result.equity_curve[result.equity_curve.length - 1].date).toLocaleDateString("en-ZA")}</span>
              </div>
            </div>
          )}

          {/* Strategy breakdown */}
          {Object.keys(result.strategy_breakdown).length > 0 && (
            <div className="bg-bg-2 border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-[10px] uppercase tracking-widest text-ink-2">Strategy Breakdown</h3>
              </div>
              {Object.entries(result.strategy_breakdown).map(([name, s], i) => (
                <div key={name} className={cn("flex items-center justify-between px-4 py-3", i > 0 && "border-t border-border")}>
                  <span className="text-xs text-ink">{name}</span>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="text-green">{s.wins}W</span>
                    <span className="text-red">{s.losses}L</span>
                    <span className={cn("font-medium", s.win_rate >= 0.5 ? "text-green" : "text-red")}>
                      {(s.win_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

const TABS = ["Live", "Signals", "Performance", "Backtest"] as const;
type Tab = typeof TABS[number];

export default function TradingPage() {
  const [tab, setTab] = useState<Tab>("Live");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl tracking-widest text-ink">TRADING</h1>
        <p className="text-[11px] text-ink-2 mt-0.5">HF Markets Demo · MT5 Auto Trader · v2 Engine</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {TABS.map(t => <Pill key={t} label={t} active={tab === t} onClick={() => setTab(t)} />)}
      </div>

      {/* Tab content */}
      {tab === "Live"        && <LiveTab />}
      {tab === "Signals"     && <SignalsTab />}
      {tab === "Performance" && <PerformanceTab />}
      {tab === "Backtest"    && <BacktestTab />}
    </div>
  );
}