import { cn, formatZAR } from "@/lib/utils";
import { CATEGORY_COLORS } from "@/lib/types";
import type { SpendingSummary } from "@/lib/types";

const BUDGETS: Record<string, number> = {
  Groceries:     3000,
  Transport:     2000,
  "Dining Out":  3000,
  Subscriptions: 2000,
  Utilities:     2000,
  Shopping:      2000,
  Health:        1500,
  Other:         1000,
};

function pct(spent: number, budget: number) {
  return Math.min(100, Math.round((spent / budget) * 100));
}

export function SpendingPanel({ summary }: { summary: SpendingSummary[] }) {
  const total = summary.reduce((s, r) => s + r.total, 0);

  return (
    <div className="bg-bg-2 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] uppercase tracking-widest text-ink-2">Spending vs Budget</h2>
        <span className="text-[10px] text-muted">This month</span>
      </div>

      <div className="space-y-3">
        {summary.map((row) => {
          const budget = BUDGETS[row.category] ?? 1000;
          const p = pct(row.total, budget);
          const color = CATEGORY_COLORS[row.category] ?? "#5a6474";
          const over = p >= 100;
          const warn = p >= 80 && p < 100;

          return (
            <div key={row.category}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-ink">{row.category}</span>
                <span className={cn(over ? "text-red" : warn ? "text-amber" : "text-ink-2")}>
                  {formatZAR(row.total)}
                  {over && " ⚠"}
                </span>
              </div>
              <div className="h-1.5 bg-bg-4 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${p}%`,
                    backgroundColor: over ? "#ff4444" : warn ? "#ffb300" : color,
                  }}
                />
              </div>
              <div className="text-[9px] text-muted mt-0.5 text-right">
                budget {formatZAR(budget)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border mt-4 pt-3 flex justify-between text-[11px]">
        <span className="text-ink-2">Total this month</span>
        <span className="text-ink font-medium">{formatZAR(total)}</span>
      </div>
    </div>
  );
}