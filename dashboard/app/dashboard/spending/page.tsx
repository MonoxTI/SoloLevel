import { getSpendingSummary, getTransactions } from "@/lib/api";
import { SpendingPanel } from "@/components/dashboard/SpendingPanel";
import { formatZAR, formatDate } from "@/lib/utils";
import { CATEGORY_COLORS } from "@/lib/types";

export default async function SpendingPage() {
  const [summary, transactions] = await Promise.all([
    getSpendingSummary().catch(() => []),
    getTransactions(undefined, 30).catch(() => []),
  ]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl tracking-widest text-ink">SPENDING</h1>
        <p className="text-[11px] text-ink-2 mt-0.5">
          {new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SpendingPanel summary={summary} />

        {/* Recent transactions */}
        <div className="bg-bg-2 border border-border rounded-lg p-4">
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2 mb-4">Recent Transactions</h2>

          {transactions.length === 0 ? (
            <p className="text-ink-2 text-xs py-4">
              No transactions yet. Log one via the bot: "log R250 Woolworths"
            </p>
          ) : (
            <div className="space-y-1">
              {transactions.map((tx: any) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[tx.category] ?? "#5a6474" }}
                    />
                    <div>
                      <div className="text-xs text-ink">{tx.merchant ?? tx.category}</div>
                      <div className="text-[10px] text-muted">{formatDate(tx.date)}</div>
                    </div>
                  </div>
                  <div className="text-xs text-ink font-medium">{formatZAR(tx.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}