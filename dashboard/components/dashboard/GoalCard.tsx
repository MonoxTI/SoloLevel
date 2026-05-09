"use client";

import { useState } from "react";
import Link from "next/link";
import { cn, formatZAR, formatDate, daysUntil } from "@/lib/utils";
import { GOAL_TYPE_LABELS, DIFFICULTY_COLORS, DIFFICULTY_XP } from "@/lib/types";
import type { Goal } from "@/lib/types";
import { completeGoal, deleteGoal } from "@/lib/api";

const DIFFICULTY_EMOJI = { EASY: "🟢", MEDIUM: "🟡", HARD: "🔴" };

interface GoalCardProps {
  goal: Goal;
  onComplete?: (goalId: string) => void;
  onDelete?: (goalId: string) => void;
  compact?: boolean;
}

export function GoalCard({ goal, onComplete, onDelete, compact = false }: GoalCardProps) {
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const daysLeft = goal.deadline ? daysUntil(goal.deadline) : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

  async function handleComplete() {
    setCompleting(true);
    try {
      await completeGoal(goal.id);
      onComplete?.(goal.id);
    } catch { setCompleting(false); }
  }

  async function handleDelete() {
    if (!confirm) { setConfirm(true); return; }
    setDeleting(true);
    try {
      await deleteGoal(goal.id);
      onDelete?.(goal.id);
    } catch { setDeleting(false); setConfirm(false); }
  }

  return (
    <div className={cn(
      "bg-bg-2 border border-border rounded-lg transition-all",
      goal.completed && "opacity-60",
      compact ? "p-3" : "p-4"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Difficulty badge */}
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold",
              DIFFICULTY_COLORS[goal.difficulty]
            )}>
              {DIFFICULTY_EMOJI[goal.difficulty]} {goal.difficulty}
            </span>
            {/* Type badge */}
            <span className="text-[9px] px-1.5 py-0.5 rounded border text-ink-2 border-border bg-bg-4 uppercase tracking-wider">
              {GOAL_TYPE_LABELS[goal.type]}
            </span>
            {goal.completed && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border text-green border-green/30 bg-green-muted uppercase tracking-wider">
                ✓ Done
              </span>
            )}
          </div>
          <h3 className={cn(
            "text-ink font-medium mt-1.5 leading-snug",
            compact ? "text-xs" : "text-sm"
          )}>
            {goal.title}
          </h3>
        </div>

        {/* XP reward */}
        <div className="text-right flex-shrink-0">
          <div className={cn(
            "font-display leading-tight",
            goal.difficulty === "HARD" ? "text-red" :
            goal.difficulty === "MEDIUM" ? "text-amber" : "text-green",
            compact ? "text-lg" : "text-2xl"
          )}>
            {goal.xp_reward}
          </div>
          <div className="text-[9px] text-ink-2 uppercase tracking-widest">XP</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[10px] text-ink-2 mb-1">
          <span>{formatZAR(goal.current_value)}</span>
          <span>{goal.progress_pct}% of {formatZAR(goal.target_value)}</span>
        </div>
        <div className="h-1.5 bg-bg-4 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full animate-fill-bar",
              goal.progress_pct >= 100 ? "bg-green" :
              goal.progress_pct >= 70 ? "bg-cyan" :
              goal.progress_pct >= 40 ? "bg-amber" : "bg-red"
            )}
            style={{ "--target-width": `${goal.progress_pct}%` } as React.CSSProperties}
          />
        </div>
      </div>

      {/* Footer */}
      {!compact && (
        <div className="flex items-center justify-between mt-3">
          <div className="text-[10px]">
            {daysLeft !== null ? (
              <span className={cn(
                isOverdue ? "text-red" : isUrgent ? "text-amber" : "text-ink-2"
              )}>
                {isOverdue ? `${Math.abs(daysLeft)}d overdue` :
                 daysLeft === 0 ? "Due today" : `${daysLeft}d left`}
                {goal.deadline && ` · ${formatDate(goal.deadline)}`}
              </span>
            ) : (
              <span className="text-muted">No deadline</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Delete button */}
            {!goal.completed && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={cn(
                  "text-[10px] px-2 py-1 rounded border transition-colors",
                  confirm
                    ? "bg-red-muted border-red/40 text-red hover:bg-red/20"
                    : "border-border text-muted hover:text-red hover:border-red/30"
                )}
              >
                {deleting ? "..." : confirm ? "Sure?" : "✕"}
              </button>
            )}

            {/* Complete button */}
            {!goal.completed && goal.progress_pct >= 100 && (
              <button
                onClick={handleComplete}
                disabled={completing}
                className="text-[10px] px-2.5 py-1 rounded bg-green-muted border
                           border-green/30 text-green hover:bg-green/20 transition-colors"
              >
                {completing ? "..." : "Claim XP →"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function GoalCardCompact({ goal }: { goal: Goal }) {
  return <GoalCard goal={goal} compact />;
}