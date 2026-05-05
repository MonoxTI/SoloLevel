import { cn, formatZAR } from "@/lib/utils";

interface Stat {
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
  accent: "cyan" | "green" | "amber" | "red";
}

const ACCENT_STYLES = {
  cyan:  { border: "border-l-cyan",  value: "text-cyan" },
  green: { border: "border-l-green", value: "text-green" },
  amber: { border: "border-l-amber", value: "text-amber" },
  red:   { border: "border-l-red",   value: "text-red" },
};

function StatCard({ stat }: { stat: Stat }) {
  const styles = ACCENT_STYLES[stat.accent];
  return (
    <div
      className={cn(
        "bg-bg-2 border border-border border-l-2 rounded-lg p-4 cursor-default",
        "hover:border-border-bright transition-colors",
        styles.border
      )}
    >
      <div className="text-[10px] text-ink-2 uppercase tracking-widest mb-2">{stat.label}</div>
      <div className={cn("font-display text-3xl tracking-wide", styles.value)}>{stat.value}</div>
      {stat.delta && (
        <div
          className={cn(
            "text-[10px] mt-1.5",
            stat.deltaUp ? "text-green-dim" : "text-red-dim"
          )}
        >
          {stat.deltaUp ? "▲" : "▼"} {stat.delta}
        </div>
      )}
    </div>
  );
}

interface StatGridProps {
  netWorth: number;
  netWorthDelta?: number;
  spentThisMonth: number;
  budget?: number;
  portfolioPnl?: number;
  creditScore?: number;
}

export function StatGrid({
  netWorth,
  netWorthDelta,
  spentThisMonth,
  budget = 9000,
  portfolioPnl,
  creditScore,
}: StatGridProps) {
  const budgetRemaining = budget - spentThisMonth;
  const budgetUnder = budgetRemaining > 0;

  const stats: Stat[] = [
    {
      label: "Net Worth",
      value: formatZAR(netWorth),
      delta: netWorthDelta ? `${formatZAR(Math.abs(netWorthDelta))} this month` : undefined,
      deltaUp: (netWorthDelta ?? 0) > 0,
      accent: "cyan",
    },
    {
      label: "Spent This Month",
      value: formatZAR(spentThisMonth),
      delta: budgetUnder
        ? `${formatZAR(budgetRemaining)} under budget`
        : `${formatZAR(Math.abs(budgetRemaining))} over budget`,
      deltaUp: budgetUnder,
      accent: "green",
    },
    {
      label: "Portfolio P&L",
      value: portfolioPnl != null ? formatZAR(portfolioPnl) : "—",
      delta: portfolioPnl != null ? "Today" : "Connect trading",
      deltaUp: (portfolioPnl ?? 0) >= 0,
      accent: "amber",
    },
    {
      label: "Credit Score",
      value: creditScore != null ? String(creditScore) : "—",
      delta: creditScore != null
        ? creditScore >= 670 ? "Good standing" : "Fair — improve it"
        : "Not connected",
      deltaUp: (creditScore ?? 0) >= 670,
      accent: "red",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((s) => (
        <StatCard key={s.label} stat={s} />
      ))}
    </div>
  );
}