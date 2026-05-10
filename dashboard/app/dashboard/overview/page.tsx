import Link from "next/link";
import { getUser, getGoals, getSpendingSummary } from "@/lib/api";
import { getNetWorthLive, getDailyStatus, getPortfolioSummary } from "@/lib/api-extended";
import { XPBar } from "@/components/dashboard/XPBar";
import { StatGrid } from "@/components/dashboard/StatGrid";
import { GoalCardCompact } from "@/components/dashboard/GoalCard";
import { SpendingPanel } from "@/components/dashboard/SpendingPanel";
import { AlertPanel } from "@/components/dashboard/AlertPanel";
import { DailyGoalsPanel } from "@/components/dashboard/DailyGoalsPanel";

export const dynamic = "force-dynamic";

const FALLBACK_USER = {
  id: "", name: "Monox", xp: 0, level: 1, streak: 0,
  last_active: null, created_at: "",
};

export default async function OverviewPage() {
  const [user, goals, summary, netWorth, dailyStatus, portfolio] = await Promise.all([
    getUser().catch(() => FALLBACK_USER),
    getGoals(undefined, false).catch(() => []),
    getSpendingSummary().catch(() => []),
    getNetWorthLive().catch(() => null),
    getDailyStatus().catch(() => null),
    getPortfolioSummary().catch(() => null),
  ]);

  const totalSpent = summary.reduce((s: number, r: any) => s + r.total, 0);
  const activeGoals = goals.slice(0, 3);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-widest text-ink">OVERVIEW</h1>
          <p className="text-[11px] text-ink-2 mt-0.5">
            {new Date().toLocaleDateString("en-ZA", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-2">
          <span className="w-2 h-2 rounded-full bg-green inline-block shadow-[0_0_6px_#00ff88]" />
          All systems live
        </div>
      </div>

      {/* XP Bar */}
      <XPBar user={user} />

      {/* Stat grid */}
      <StatGrid
        netWorth={netWorth?.current_value ?? 0}
        netWorthDelta={netWorth ? netWorth.current_value - netWorth.base_value : 0}
        spentThisMonth={totalSpent}
        budget={9000}
        portfolioPnl={portfolio?.total_pnl ?? undefined}
        creditScore={undefined}
      />

      {/* Daily goals + Goals side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DailyGoalsPanel status={dailyStatus} />

        {/* Goals panel */}
        <div className="bg-bg-2 border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] uppercase tracking-widest text-ink-2">Active Goals</h2>
            <Link href="/dashboard/goals" className="text-[10px] text-cyan hover:text-cyan-dim transition-colors">
              view all →
            </Link>
          </div>
          {activeGoals.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-ink-2 text-xs mb-3">No active goals yet.</p>
              <Link
                href="/dashboard/goals"
                className="text-[11px] px-4 py-2 rounded bg-cyan-muted border border-cyan/30
                           text-cyan hover:bg-cyan/10 transition-colors"
              >
                + Set your first goal
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {activeGoals.map((goal: any) => (
                <GoalCardCompact key={goal.id} goal={goal} />
              ))}
              {goals.length > 3 && (
                <Link
                  href="/dashboard/goals"
                  className="block text-center text-[10px] text-ink-2 hover:text-cyan transition-colors pt-1"
                >
                  +{goals.length - 3} more goals →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Spending + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {summary.length > 0 ? (
          <SpendingPanel summary={summary} />
        ) : (
          <div className="bg-bg-2 border border-border rounded-lg p-4 flex flex-col
                          items-center justify-center gap-2 min-h-[160px]">
            <p className="text-ink-2 text-xs">No spending data yet.</p>
            <p className="text-muted text-[11px]">
              Tell the bot: <span className="text-cyan">"log R250 Woolworths"</span>
            </p>
          </div>
        )}
        <AlertPanel goals={goals} summary={summary} />
      </div>

      {/* Net worth budget progress */}
      {netWorth && (
        <div className="bg-bg-2 border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] uppercase tracking-widest text-ink-2">
              Yearly Budget Goal
            </h2>
            <span className="text-[10px] text-ink-2">
              {new Date().getFullYear()}
            </span>
          </div>
          <div className="flex justify-between text-[11px] mb-1.5">
            <span className="text-ink">
              Saved R{netWorth.saved_this_year.toLocaleString("en-ZA")}
            </span>
            <span className="text-ink-2">
              Goal: R{netWorth.yearly_budget_goal.toLocaleString("en-ZA")}
            </span>
          </div>
          <div className="h-2 bg-bg-4 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-dim to-cyan animate-fill-bar"
              style={{ "--target-width": `${netWorth.budget_progress_pct}%` } as React.CSSProperties}
            />
          </div>
          <div className="flex justify-between text-[10px] mt-1.5">
            <span className="text-cyan">{netWorth.budget_progress_pct}% complete</span>
            <span className="text-muted">
              R{netWorth.budget_remaining.toLocaleString("en-ZA")} remaining
            </span>
          </div>
        </div>
      )}
    </div>
  );
}