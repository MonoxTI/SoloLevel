import Link from "next/link";
import { getUser, getGoals, getSpendingSummary } from "@/lib/api";
import { XPBar } from "@/components/dashboard/XPBar";
import { StatGrid } from "@/components/dashboard/StatGrid";
import { GoalCardCompact } from "@/components/dashboard/GoalCard";
import { SpendingPanel } from "@/components/dashboard/SpendingPanel";
import { AlertPanel } from "@/components/dashboard/AlertPanel";

// Fallback data while API is being set up
const FALLBACK_USER = { id: "", name: "Itu", xp: 3400, level: 14, streak: 12, last_active: null, created_at: "" };
const FALLBACK_GOALS = [] as any[];
const FALLBACK_SUMMARY = [] as any[];

export default async function OverviewPage() {
  const [user, goals, summary] = await Promise.all([
    getUser().catch(() => FALLBACK_USER),
    getGoals(undefined, false).catch(() => FALLBACK_GOALS),
    getSpendingSummary().catch(() => FALLBACK_SUMMARY),
  ]);

  const totalSpent = summary.reduce((s: number, r: any) => s + r.total, 0);
  const activeGoals = goals.slice(0, 3);

  const now = new Date();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-widest text-ink">OVERVIEW</h1>
          <p className="text-[11px] text-ink-2 mt-0.5">
            {now.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
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
        netWorth={284500}
        netWorthDelta={3200}
        spentThisMonth={totalSpent}
        budget={9000}
        portfolioPnl={1820}
        creditScore={642}
      />

      {/* Goals summary + Spending side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Goals panel */}
        <div className="bg-bg-2 border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[10px] uppercase tracking-widest text-ink-2">Active Goals</h2>
            <Link
              href="/goals"
              className="text-[10px] text-cyan hover:text-cyan-dim transition-colors"
            >
              view all →
            </Link>
          </div>

          {activeGoals.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-ink-2 text-xs mb-3">No active goals yet.</p>
              <Link
                href="/goals"
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
                  href="/goals"
                  className="block text-center text-[10px] text-ink-2 hover:text-cyan
                             transition-colors pt-1"
                >
                  +{goals.length - 3} more goals →
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Spending panel */}
        {summary.length > 0 ? (
          <SpendingPanel summary={summary} />
        ) : (
          <div className="bg-bg-2 border border-border rounded-lg p-4 flex items-center justify-center">
            <p className="text-ink-2 text-xs">No spending data yet. Start logging via the bot.</p>
          </div>
        )}
      </div>

      {/* Alerts */}
      <AlertPanel goals={goals} summary={summary} />
    </div>
  );
}