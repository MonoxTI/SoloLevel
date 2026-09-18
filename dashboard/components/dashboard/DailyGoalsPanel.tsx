"use client";

import { type FormEvent, useState } from "react";
import { cn } from "@/lib/utils";
import { completeDailyGoal, createDailyGoal, deleteDailyGoal } from "@/lib/api";

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
  const [goals, setGoals] = useState(status?.goals ?? []);
  const [ticked, setTicked] = useState<Set<string>>(
    new Set(status?.goals.filter(g => g.completed).map(g => g.key) ?? [])
  );
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  if (!status) {
    return (
      <div className="bg-bg-2 border border-border rounded-lg p-4 flex items-center justify-center min-h-[160px]">
        <p className="text-ink-2 text-xs">Daily goals unavailable</p>
      </div>
    );
  }

  const done = ticked.size;
  const total = goals.length;
  const xpToday = status.total_xp_today;

  async function handleComplete(key: string) {
    setWorkingKey(key);
    try {
      await completeDailyGoal(key);
      setTicked((current) => new Set([...current, key]));
    } finally {
      setWorkingKey(null);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const created = await createDailyGoal(title.trim());
      setGoals((current) => [...current, created]);
      setTitle("");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(key: string) {
    if (!key.startsWith("custom_")) return;
    setDeletingKey(key);
    try {
      await deleteDailyGoal(key);
      setGoals((current) => current.filter((goal) => goal.key !== key));
      setTicked((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    } finally {
      setDeletingKey(null);
    }
  }

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
        {goals.map((goal) => {
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
              <div className="flex items-center gap-3 text-right flex-shrink-0">
                <span className={cn(
                  "text-[10px]",
                  isDone ? "text-green" : "text-ink-2"
                )}>
                  {isDone ? `+${goal.xp_gain}` : `+${goal.xp_gain}`} XP
                </span>
                {!isDone && <>
                  <span className="text-[10px] text-red">/ -{goal.xp_loss}</span>
                  <button
                    type="button"
                    onClick={() => handleComplete(goal.key)}
                    disabled={workingKey === goal.key}
                    className="text-[10px] text-cyan hover:text-cyan-dim disabled:opacity-40"
                  >
                    {workingKey === goal.key ? "..." : "done"}
                  </button>
                  {goal.key.startsWith("custom_") && (
                    <button
                      type="button"
                      onClick={() => handleDelete(goal.key)}
                      disabled={deletingKey === goal.key}
                      className="text-[10px] text-red hover:text-red/80 disabled:opacity-40"
                    >
                      {deletingKey === goal.key ? "..." : "delete"}
                    </button>
                  )}
                </>}
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

      <form onSubmit={handleCreate} className="mt-4 flex gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a daily goal"
          className="min-w-0 flex-1 rounded-md border border-border bg-bg-3 px-3 py-2 text-xs text-ink outline-none placeholder:text-muted focus:border-cyan"
          maxLength={100}
        />
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="rounded-md border border-cyan/30 bg-cyan-muted px-3 text-[10px] text-cyan disabled:opacity-40"
        >
          {saving ? "..." : "+ Add"}
        </button>
      </form>

      <p className="text-[10px] text-muted mt-3 text-center">
        Complete each goal here or via the bot.
      </p>
    </div>
  );
}