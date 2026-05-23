import { getPortfolio, getTradingSignals } from "@/lib/api";
import { formatZAR, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BASE = process.env.PYTHON_API_URL ?? "http://localhost:8000";

async function getMT5Status() {
  try {
    const res = await fetch(`${BASE}/forex/mt5/status`, { cache: "no-store" });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

async function getMT5Positions() {
  try {
    const res = await fetch(`${BASE}/forex/mt5/positions`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.positions ?? [];
  } catch { return []; }
}

async function getForexSignals() {
  try {
    const res = await fetch(`${BASE}/forex/scan`, { cache: "no-store" });
    return res.ok ? res.json() : [];
  } catch { return []; }
}

const REC_STYLES: Record<string, { border: string; badge: string; icon: string }> = {
  BUY:   { border: "border-l-green", badge: "text-green bg-green-muted border-green/30",  icon: "▲" },
  SELL:  { border: "border-l-red",   badge: "text-red bg-red-muted border-red/30",         icon: "▼" },
  HOLD:  { border: "border-l-amber", badge: "text-amber bg-amber-muted border-amber/30",  icon: "◆" },
  ERROR: { border: "border-border",  badge: "text-muted bg-bg-4 border-border",            icon: "?" },
};

export default async function TradingPage() {
  const [mt5Status, mt5Positions, forexSignals, portfolio] = await Promise.all([
    getMT5Status(),
    getMT5Positions(),
    getForexSignals(),
    getPortfolio().catch(() => null),
  ]);

  const isConnected = mt5Status?.connected === true;
  const account = mt5Status?.account ?? null;

  const totalPnl = mt5Positions.reduce((sum: number, p: any) => sum + (p.profit ?? 0), 0);
  const buys  = forexSignals.filter((s: any) => s.signal === "BUY");
  const sells = forexSignals.filter((s: any) => s.signal === "SELL");
  const holds = forexSignals.filter((s: any) => s.signal === "HOLD");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-widest text-ink">TRADING</h1>
          <p className="text-[11px] text-ink-2 mt-0.5">
            HF Markets Demo · MT5 Auto Trader
          </p>
        </div>
        {/* MT5 connection status */}
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md border text-[11px]",
          isConnected
            ? "bg-green-muted border-green/30 text-green"
            : "bg-red-muted border-red/30 text-red"
        )}>
          <span className={cn(
            "w-2 h-2 rounded-full",
            isConnected ? "bg-green shadow-[0_0_6px_#00ff88]" : "bg-red"
          )} />
          {isConnected ? "MT5 Connected" : "MT5 Disconnected"}
        </div>
      </div>

      {/* MT5 not connected warning */}
      {!isConnected && (
        <div className="bg-amber-muted border border-amber/30 rounded-lg p-4 text-[11px] text-amber">
          ⚠️ MT5 is not connected. Open MetaTrader 5 on your PC, log into HF Markets Demo (account 57447432),
          then restart the Python API. The auto trader cannot place trades until MT5 is running.
        </div>
      )}

      {/* Account summary */}
      {account && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Balance",      value: formatZAR(account.balance),    accent: "cyan" },
            { label: "Equity",       value: formatZAR(account.equity),     accent: "ink" },
            { label: "Open P&L",     value: `${totalPnl >= 0 ? "+" : ""}${formatZAR(totalPnl)}`,
              accent: totalPnl >= 0 ? "green" : "red" },
            { label: "Free Margin",  value: formatZAR(account.free_margin), accent: "ink" },
          ].map(stat => (
            <div key={stat.label} className="bg-bg-2 border border-border rounded-lg p-3">
              <div className="text-[10px] text-ink-2 uppercase tracking-widest mb-1">{stat.label}</div>
              <div className={cn("font-display text-2xl tracking-wide",
                stat.accent === "green" ? "text-green" :
                stat.accent === "red"   ? "text-red"   :
                stat.accent === "cyan"  ? "text-cyan"  : "text-ink"
              )}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Open MT5 positions */}
      <div className="bg-bg-2 border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2">
            Live Positions ({mt5Positions.length})
          </h2>
          <span className="text-[10px] text-muted">
            {totalPnl >= 0 ? "+" : ""}{formatZAR(totalPnl)} total P&L
          </span>
        </div>

        {mt5Positions.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-ink-2 text-xs">No open positions.</p>
            <p className="text-muted text-[11px] mt-1">
              {isConnected
                ? "The algo will place trades when signals align."
                : "Connect MT5 to start trading."}
            </p>
          </div>
        ) : (
          mt5Positions.map((pos: any, i: number) => (
            <div
              key={pos.ticket}
              className={cn(
                "flex items-center justify-between px-4 py-3",
                i > 0 && "border-t border-border"
              )}
            >
              <div className="flex items-center gap-3">
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded border font-semibold",
                  pos.direction === "BUY"
                    ? "text-green bg-green-muted border-green/30"
                    : "text-red bg-red-muted border-red/30"
                )}>
                  {pos.direction}
                </span>
                <div>
                  <div className="text-xs text-ink font-medium">{pos.symbol}</div>
                  <div className="text-[10px] text-muted">
                    {pos.volume} lots · Entry {pos.open_price}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                {/* SL / TP */}
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] text-muted">
                    SL: <span className="text-red">{pos.sl || "—"}</span>
                  </div>
                  <div className="text-[10px] text-muted">
                    TP: <span className="text-green">{pos.tp || "—"}</span>
                  </div>
                </div>

                {/* P&L */}
                <div className="text-right">
                  <div className={cn(
                    "text-sm font-semibold font-display",
                    pos.profit >= 0 ? "text-green" : "text-red"
                  )}>
                    {pos.profit >= 0 ? "+" : ""}{formatZAR(pos.profit)}
                  </div>
                  <div className="text-[10px] text-muted">
                    #{pos.ticket}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Signal summary pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] text-ink-2 uppercase tracking-widest">Signals:</span>
        {[
          { label: "BUY",  count: buys.length,  color: "text-green bg-green-muted border-green/30" },
          { label: "HOLD", count: holds.length, color: "text-amber bg-amber-muted border-amber/30" },
          { label: "SELL", count: sells.length, color: "text-red bg-red-muted border-red/30" },
        ].map(s => (
          <div key={s.label} className={cn(
            "px-3 py-1 rounded border text-[11px] font-medium",
            s.color
          )}>
            {s.count} {s.label}
          </div>
        ))}
        <span className="ml-auto text-[10px] text-muted">
          {forexSignals[0]?.analysed_at
            ? `Scanned ${new Date(forexSignals[0].analysed_at).toLocaleTimeString("en-ZA")}`
            : "Not yet scanned"}
        </span>
      </div>

      {/* Forex signal cards */}
      {forexSignals.length === 0 ? (
        <div className="bg-bg-2 border border-border rounded-lg p-8 text-center">
          <p className="text-ink-2 text-sm">No signals yet.</p>
          <p className="text-muted text-xs mt-1">
            Make sure the Python API is running and yfinance is installed.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forexSignals.map((signal: any) => {
            const style = REC_STYLES[signal.signal ?? signal.recommendation] ?? REC_STYLES.ERROR;
            return (
              <div key={signal.symbol} className={cn(
                "bg-bg-2 border border-border border-l-2 rounded-lg p-4",
                style.border
              )}>
                {/* Symbol + recommendation */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-ink font-semibold text-sm">{signal.symbol}</div>
                    <div className="text-ink-2 text-[11px] mt-0.5">
                      {signal.price ? signal.price.toFixed(5) : "N/A"}
                    </div>
                  </div>
                  <span className={cn(
                    "text-[10px] px-2 py-1 rounded border font-semibold uppercase tracking-wide",
                    style.badge
                  )}>
                    {style.icon} {signal.signal ?? signal.recommendation}
                  </span>
                </div>

                {/* Indicators */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { label: "RSI",   value: signal.rsi?.toFixed(1),
                      color: signal.rsi < 30 ? "text-green" : signal.rsi > 70 ? "text-red" : "text-ink" },
                    { label: "MACD",  value: signal.macd?.toFixed(4),
                      color: signal.macd > 0 ? "text-green" : "text-red" },
                    { label: "Score", value: signal.score > 0 ? `+${signal.score}` : signal.score,
                      color: signal.score > 0 ? "text-green" : signal.score < 0 ? "text-red" : "text-ink" },
                  ].map(ind => (
                    <div key={ind.label} className="bg-bg-3 rounded p-2 text-center">
                      <div className="text-[9px] text-muted uppercase mb-0.5">{ind.label}</div>
                      <div className={cn("text-xs font-semibold", ind.color)}>
                        {ind.value ?? "—"}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Trade setup if available */}
                {signal.trade_setup && signal.risk_check?.approved && (
                  <div className="bg-bg-3 rounded p-2 text-[10px] space-y-1">
                    <div className="text-ink-2 uppercase tracking-wider mb-1">Trade Setup</div>
                    <div className="flex justify-between">
                      <span className="text-muted">Entry</span>
                      <span className="text-ink">{signal.trade_setup.entry}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">SL</span>
                      <span className="text-red">{signal.trade_setup.stop_loss}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">TP</span>
                      <span className="text-green">{signal.trade_setup.take_profit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Lots</span>
                      <span className="text-ink">{signal.trade_setup.lot_size}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Risk</span>
                      <span className="text-amber">{formatZAR(signal.trade_setup.risk_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">RR</span>
                      <span className="text-ink">1:{signal.trade_setup.rr_ratio}</span>
                    </div>
                  </div>
                )}

                {/* Risk rejected reason */}
                {signal.trade_setup && signal.risk_check && !signal.risk_check.approved && (
                  <div className="text-[10px] text-amber mt-1">
                    ⚠ {signal.risk_check.reason}
                  </div>
                )}

                {signal.error && (
                  <div className="text-[10px] text-red mt-1">Error: {signal.error}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}