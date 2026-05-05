"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createGoal } from "@/lib/api";
import type { GoalType } from "@/lib/types";

const GOAL_TYPES: { value: GoalType; label: string; hint: string }[] = [
  { value: "SAVINGS",        label: "Savings",      hint: "Save a target amount" },
  { value: "SPENDING_LIMIT", label: "Spend Limit",  hint: "Keep spending under a cap" },
  { value: "NET_WORTH",      label: "Net Worth",    hint: "Reach a net worth milestone" },
  { value: "TRADE_TARGET",   label: "Trade Target", hint: "Hit a portfolio value" },
  { value: "CUSTOM",         label: "Custom",       hint: "Anything you want to track" },
];

export function CreateGoalForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "SAVINGS" as GoalType,
    target_value: "",
    deadline: "",
    xp_reward: "100",
  });

  function set(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
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
        target_value: Number(form.target_value),
        deadline: form.deadline || undefined,
        xp_reward: Number(form.xp_reward) || 100,
      });
      setForm({ title: "", description: "", type: "SAVINGS", target_value: "", deadline: "", xp_reward: "100" });
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
      {/* Toggle */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 text-left
                   hover:bg-bg-3 transition-colors"
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
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Emergency fund"
              className="w-full bg-bg-4 border border-border text-ink text-xs rounded px-3 py-2
                         placeholder-muted focus:outline-none focus:border-cyan/50 font-mono"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-[10px] text-ink-2 uppercase tracking-widest mb-1">Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {GOAL_TYPES.map((t) => (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => set("type", t.value)}
                  title={t.hint}
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

          {/* Target + Deadline in a row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-ink-2 uppercase tracking-widest mb-1">
                Target (ZAR)
              </label>
              <input
                type="number"
                value={form.target_value}
                onChange={(e) => set("target_value", e.target.value)}
                placeholder="10000"
                min="1"
                className="w-full bg-bg-4 border border-border text-ink text-xs rounded px-3 py-2
                           placeholder-muted focus:outline-none focus:border-cyan/50 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-ink-2 uppercase tracking-widest mb-1">
                Deadline (optional)
              </label>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => set("deadline", e.target.value)}
                className="w-full bg-bg-4 border border-border text-ink text-xs rounded px-3 py-2
                           focus:outline-none focus:border-cyan/50 font-mono"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] text-ink-2 uppercase tracking-widest mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Why this goal matters"
              className="w-full bg-bg-4 border border-border text-ink text-xs rounded px-3 py-2
                         placeholder-muted focus:outline-none focus:border-cyan/50 font-mono"
            />
          </div>

          {/* XP Reward */}
          <div>
            <label className="block text-[10px] text-ink-2 uppercase tracking-widest mb-1">
              XP Reward
            </label>
            <select
              value={form.xp_reward}
              onChange={(e) => set("xp_reward", e.target.value)}
              className="bg-bg-4 border border-border text-ink text-xs rounded px-3 py-2
                         focus:outline-none focus:border-cyan/50 font-mono"
            >
              <option value="50">50 XP — Easy</option>
              <option value="100">100 XP — Normal</option>
              <option value="200">200 XP — Hard</option>
              <option value="500">500 XP — Epic</option>
            </select>
          </div>

          {error && <p className="text-red text-[11px]">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs rounded bg-cyan-muted border border-cyan/30
                         text-cyan hover:bg-cyan/10 transition-colors disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create Goal"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
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