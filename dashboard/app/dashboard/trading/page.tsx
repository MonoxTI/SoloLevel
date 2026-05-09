import { getTradingSignals, getPortfolio } from "@/lib/api";
import { formatZAR } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { TradingSignal } from "@/lib/types";

export const dynamic = "force-dynamic";

const REC_STYLES = {
  BUY:   { border: "border-l-green",  badge: "text-green bg-green-muted border-green/30",  icon: "▲" },
  SELL:  { border: "border-l-red",    badge: "text-red bg-red-muted border-red/30",          icon: "▼" },
  HOLD:  { border: "border-l-amber",  badge: "text-amber bg-amber-muted border-amber/30",   icon: "◆" },
  ERROR: { border: "border-l-muted",  badge: "text-muted bg-bg-4 border-border",             icon: "?" },
};

function SignalCard({ signal }: { signal: TradingSignal }) {
  const style = REC_STYLES[signal.recommendation] ?? REC_STYLES.ERROR;
  return (
    <div className={cn(
      "bg-bg-2 border border-border border-l-2 rounded-lg p-4",
      style.border
    )}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-ink font-semibold text-sm">{signal.symbol}</div>
          <div className="text-ink-2 text-[11px] mt-0.5">
            {signal.price ? `R${signal.price.toLocaleString("en-ZA")}` : "Price unavailable"}
          </div>
        </div>
        <span className={cn("text-[10px] px-2 py-1 rounded border font-semibold uppercase tracking-wide", style.badge)}>
          {style.icon} {signal.recommendation}
        </span>
      </div>

      {/* Indicators */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-bg-3 rounded p-2 text-center">
          <div className="text-[9px] text-muted uppercase mb-0.5">RSI</div>
          <div className={cn(
            "text-xs font-semibold",
            signal.rsi && signal.rsi < 30 ? "text-green" :
            signal.rsi && signal.rsi > 70 ? "text-red" : "text-ink"
          )}>
            {signal.rsi?.toFixed(1) ?? "—"}
          </div>
        </div>
        <div className="bg-bg-3 rounded p-2 text-center">
          <div className="text-[9px] text-muted uppercase mb-0.5">MACD</div>
          <div className={cn("text-xs font-semibold", signal.macd && signal.macd > 0 ? "text-green" : "text-red")}>
            {signal.macd?.toFixed(3) ?? "—"}
          </div>
        </div>
        <div className="bg-bg-3 rounded p-2 text-center">
          <div className="text-[9px] text-muted uppercase mb-0.5">Score</div>
          <div className={cn("text-xs font-semibold", signal.score > 0 ? "text-green" : signal.score < 0 ? "text-red" : "text-ink")}>
            {signal.score > 0 ? `+${signal.score}` : signal.score}
          </div>
        </div>
      </div>

      {/* Signal reasons */}
      {signal.signals.length > 0 && (
        <div className="space-y-1">
          {signal.signals.slice(0, 2).map((s, i) => (
            <div key={i} className="text-[10px] text-ink-2 flex items-start gap-1.5">
              <span className="text-muted mt-px">›</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {signal.error && (
        <div className="text-[10px] text-red mt-1">Error: {signal.error}</div>
      )}
    </div>
  );
}

export default async function TradingPage() {
  const [signals, portfolio] = await Promise.all([
    getTradingSignals().catch(() => []),
    getPortfolio().catch(() => null),
  ]);

  const buys  = signals.filter(s => s.recommendation === "BUY");
  const sells = signals.filter(s => s.recommendation === "SELL");
  const holds = signals.filter(s => s.recommendation === "HOLD");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-widest text-ink">TRADING</h1>
          <p className="text-[11px] text-ink-2 mt-0.5">JSE signals · RSI + MACD + Bollinger Bands</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-ink-2">Last scan</div>
          <div className="text-[11px] text-ink">
            {signals[0]?.analysed_at
              ? new Date(signals[0].analysed_at).toLocaleTimeString("en-ZA")
              : "—"}
          </div>
        </div>
      </div>

      {/* Portfolio summary */}
      {portfolio && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Open Trades",     value: String(portfolio.open_trades),                    accent: "cyan" },
            { label: "Total Invested",  value: formatZAR(portfolio.total_invested),               accent: "ink" },
            { label: "Total P&L",       value: formatZAR(portfolio.total_pnl),                    accent: portfolio.total_pnl >= 0 ? "green" : "red" },
            { label: "P&L %",           value: `${portfolio.total_pnl_pct >= 0 ? "+" : ""}${portfolio.total_pnl_pct}%`, accent: portfolio.total_pnl_pct >= 0 ? "green" : "red" },
          ].map(stat => (
            <div key={stat.label} className="bg-bg-2 border border-border rounded-lg p-3">
              <div className="text-[10px] text-ink-2 uppercase tracking-widest mb-1">{stat.label}</div>
              <div className={cn("font-display text-2xl tracking-wide",
                stat.accent === "green" ? "text-green" :
                stat.accent === "red" ? "text-red" :
                stat.accent === "cyan" ? "text-cyan" : "text-ink"
              )}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Signal summary */}
      <div className="flex gap-3">
        {[
          { label: "BUY", count: buys.length,  color: "text-green" },
          { label: "HOLD", count: holds.length, color: "text-amber" },
          { label: "SELL", count: sells.length, color: "text-red" },
        ].map(s => (
          <div key={s.label} className="bg-bg-2 border border-border rounded-lg px-4 py-2 flex items-center gap-2">
            <span className={cn("font-display text-xl", s.color)}>{s.count}</span>
            <span className="text-[10px] text-ink-2 uppercase">{s.label}</span>
          </div>
        ))}
        <div className="ml-auto text-[10px] text-muted self-center">
          Paper trading mode · Real trades coming soon
        </div>
      </div>

      {/* Signals grid */}
      {signals.length === 0 ? (
        <div className="bg-bg-2 border border-border rounded-lg p-8 text-center">
          <p className="text-ink-2 text-sm">No signals yet.</p>
          <p className="text-muted text-xs mt-1">Make sure the Python API is running and yfinance is installed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {signals.map(signal => (
            <SignalCard key={signal.symbol} signal={signal} />
          ))}
        </div>
      )}

      {/* Open trades */}
      {portfolio && portfolio.trades.filter(t => t.status === "OPEN").length > 0 && (
        <div>
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2 mb-3">Open Positions</h2>
          <div className="bg-bg-2 border border-border rounded-lg overflow-hidden">
            {portfolio.trades.filter(t => t.status === "OPEN").map((trade, i) => (
              <div
                key={trade.id}
                className={cn(
                  "flex items-center justify-between px-4 py-3",
                  i > 0 && "border-t border-border"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border font-semibold",
                    trade.side === "BUY"
                      ? "text-green bg-green-muted border-green/30"
                      : "text-red bg-red-muted border-red/30"
                  )}>
                    {trade.side}
                  </span>
                  <div>
                    <div className="text-xs text-ink font-medium">{trade.symbol}</div>
                    <div className="text-[10px] text-muted">{trade.quantity} @ R{trade.entry_price}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("text-xs font-medium", trade.pnl >= 0 ? "text-green" : "text-red")}>
                    {trade.pnl >= 0 ? "+" : ""}{formatZAR(trade.pnl)}
                  </div>
                  <div className={cn("text-[10px]", trade.pnl_pct >= 0 ? "text-green-dim" : "text-red-dim")}>
                    {trade.pnl_pct >= 0 ? "+" : ""}{trade.pnl_pct}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}