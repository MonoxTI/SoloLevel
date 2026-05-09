"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface DailyGoal {
  key: string;
  title: string;
  xp_gain: number;
  xp_loss: number;
  completed: boolean;
}

interface DailyStatus {
  date: string;
  total_xp_today: number;
  goals: DailyGoal[];
}

export function DailyGoalsPanel({ status }: { status: DailyStatus | null }) {
  const [ticked, setTicked] = useState<Set<string>>(
    new Set(status?.goals.filter(g => g.completed).map(g => g.key) ?? [])
  );

  if (!status) {
    return (
      <div className="bg-bg-2 border border-border rounded-lg p-4 flex items-center justify-center min-h-[160px]">
        <p className="text-ink-2 text-xs">Daily goals unavailable</p>
      </div>
    );
  }

  const done = ticked.size;
  const total = status.goals.length;
  const xpToday = status.total_xp_today;

  return (
    <div className="bg-bg-2 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] uppercase tracking-widest text-ink-2">Daily Goals</h2>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px] font-medium",
            xpToday > 0 ? "text-green" : xpToday < 0 ? "text-red" : "text-muted"
          )}>
            {xpToday > 0 ? "+" : ""}{xpToday} XP today
          </span>
          <span className="text-[10px] text-muted">{done}/{total}</span>
        </div>
      </div>

      <div className="space-y-2">
        {status.goals.map((goal) => {
          const isDone = ticked.has(goal.key);
          return (
            <div
              key={goal.key}
              className={cn(
                "flex items-center justify-between px-3 py-2.5 rounded-md border transition-colors",
                isDone
                  ? "bg-green-muted border-green/20"
                  : "bg-bg-3 border-border hover:border-border-bright"
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center text-[10px] flex-shrink-0",
                  isDone ? "bg-green border-green text-bg" : "border-border-bright"
                )}>
                  {isDone && "✓"}
                </div>
                <span className={cn(
                  "text-xs",
                  isDone ? "text-green line-through opacity-70" : "text-ink"
                )}>
                  {goal.title}
                </span>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={cn(
                  "text-[10px]",
                  isDone ? "text-green" : "text-ink-2"
                )}>
                  {isDone ? `+${goal.xp_gain}` : `+${goal.xp_gain}`} XP
                </span>
                {!isDone && (
                  <span className="text-[10px] text-red ml-1">/ -{goal.xp_loss}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {done === total && (
        <div className="mt-3 text-center text-[11px] text-green">
          🔥 All done today! Perfect day streak!
        </div>
      )}

      <p className="text-[10px] text-muted mt-3 text-center">
        Tick off via bot: "done gym" · "done code"
      </p>
    </div>
  );
}