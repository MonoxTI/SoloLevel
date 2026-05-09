"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createGoal } from "@/lib/api";
import type { GoalType, Difficulty } from "@/lib/types";

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: "SAVINGS", label: "Savings" },
  { value: "SPENDING_LIMIT", label: "Spend Limit" },
  { value: "NET_WORTH", label: "Net Worth" },
  { value: "TRADE_TARGET", label: "Trade Target" },
  { value: "CUSTOM", label: "Custom" },
];

const DIFFICULTIES: { value: Difficulty; label: string; xp: number; color: string; emoji: string }[] = [
  { value: "EASY",   label: "Easy",   xp: 50,  color: "text-green border-green/40 bg-green-muted", emoji: "🟢" },
  { value: "MEDIUM", label: "Medium", xp: 150, color: "text-amber border-amber/40 bg-amber-muted", emoji: "🟡" },
  { value: "HARD",   label: "Hard",   xp: 300, color: "text-red border-red/40 bg-red-muted",       emoji: "🔴" },
];

export function CreateGoalForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "", description: "",
    type: "SAVINGS" as GoalType,
    difficulty: "MEDIUM" as Difficulty,
    target_value: "", deadline: "",
  });

  function set(k: keyof typeof form, v: string) {
    setForm(p => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.title.trim()) return setError("Title is required.");
    if (!form.target_value || isNaN(Number(form.target_value))) return setError("Enter a valid target amount.");
    setLoading(true);
    try {
      await createGoal({
        title: form.title.trim(),
        description: form.description || undefined,
        type: form.type,
        difficulty: form.difficulty,
        target_value: Number(form.target_value),
        deadline: form.deadline || undefined,
      });
      setForm({ title: "", description: "", type: "SAVINGS", difficulty: "MEDIUM", target_value: "", deadline: "" });
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Failed to create goal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-bg-2 border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-3 transition-colors"
      >
        <span className="text-[11px] text-cyan tracking-wide">+ New Goal</span>
        <span className="text-muted text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 border-t border-border space-y-3 pt-4">

          {/* Title */}
          <div>
            <label className="block text-[10px] text-ink-2 uppercase tracking-widest mb-1">Title</label>
            <input
              type="text" value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="e.g. Emergency fund"
              className="w-full bg-bg-4 border border-border text-ink text-xs rounded px-3 py-2
                         placeholder-muted focus:outline-none focus:border-cyan/50 font-mono"
            />
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-[10px] text-ink-2 uppercase tracking-widest mb-1">Difficulty</label>
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTIES.map(d => (
                <button
                  type="button" key={d.value} onClick={() => set("difficulty", d.value)}
                  className={cn(
                    "text-[11px] px-2 py-2 rounded border transition-colors text-center",
                    form.difficulty === d.value ? d.color : "bg-bg-4 border-border text-ink-2 hover:border-border-bright"
                  )}
                >
                  {d.emoji} {d.label}
                  <div className="text-[9px] opacity-70 mt-0.5">{d.xp} XP</div>
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-[10px] text-ink-2 uppercase tracking-widest mb-1">Type</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {GOAL_TYPES.map(t => (
                <button
                  type="button" key={t.value} onClick={() => set("type", t.value)}
                  className={cn(
                    "text-[10px] px-2 py-1.5 rounded border transition-colors text-center",
                    form.type === t.value
                      ? "bg-cyan-muted border-cyan/40 text-cyan"
                      : "bg-bg-4 border-border text-ink-2 hover:border-border-bright"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target + Deadline */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-ink-2 uppercase tracking-widest mb-1">Target (ZAR)</label>
              <input
                type="number" value={form.target_value} onChange={e => set("target_value", e.target.value)}
                placeholder="10000" min="1"
                className="w-full bg-bg-4 border border-border text-ink text-xs rounded px-3 py-2
                           placeholder-muted focus:outline-none focus:border-cyan/50 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-ink-2 uppercase tracking-widest mb-1">Deadline</label>
              <input
                type="date" value={form.deadline} onChange={e => set("deadline", e.target.value)}
                className="w-full bg-bg-4 border border-border text-ink text-xs rounded px-3 py-2
                           focus:outline-none focus:border-cyan/50 font-mono"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] text-ink-2 uppercase tracking-widest mb-1">Description (optional)</label>
            <input
              type="text" value={form.description} onChange={e => set("description", e.target.value)}
              placeholder="Why this goal matters"
              className="w-full bg-bg-4 border border-border text-ink text-xs rounded px-3 py-2
                         placeholder-muted focus:outline-none focus:border-cyan/50 font-mono"
            />
          </div>

          {error && <p className="text-red text-[11px]">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit" disabled={loading}
              className="px-4 py-2 text-xs rounded bg-cyan-muted border border-cyan/30
                         text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create Goal"}
            </button>
            <button
              type="button" onClick={() => setOpen(false)}
              className="px-4 py-2 text-xs rounded border border-border text-ink-2
                         hover:text-ink hover:border-border-bright transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}