import { getGoals } from "@/lib/api";
import { GoalCard } from "@/components/dashboard/GoalCard";
import { CreateGoalForm } from "@/components/dashboard/CreateGoalForm";

export default async function GoalsPage() {
  const [active, completed] = await Promise.all([
    getGoals(undefined, false).catch(() => []),
    getGoals(undefined, true).catch(() => []),
  ]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-widest text-ink">GOALS</h1>
          <p className="text-[11px] text-ink-2 mt-0.5">
            {active.length} active · {completed.length} completed
          </p>
        </div>
      </div>

      {/* Create form */}
      <CreateGoalForm />

      {/* Active goals */}
      {active.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2 mb-3">Active</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {active.map((goal: any) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        </section>
      )}

      {active.length === 0 && (
        <div className="bg-bg-2 border border-border rounded-lg p-8 text-center">
          <p className="text-ink-2 text-sm mb-1">No active goals yet.</p>
          <p className="text-muted text-xs">Use the form above or tell the bot: "save R10000 by December"</p>
        </div>
      )}

      {/* Completed goals */}
      {completed.length > 0 && (
        <section>
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2 mb-3">Completed</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {completed.map((goal: any) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}