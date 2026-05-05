"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Goal, SpendingSummary } from "@/lib/types";

type AlertLevel = "danger" | "warn" | "success" | "info";

interface Alert {
  id: string;
  level: AlertLevel;
  icon: string;
  message: string;
}

const LEVEL_STYLES: Record<AlertLevel, string> = {
  danger:  "bg-red-muted border-red/30 text-red",
  warn:    "bg-amber-muted border-amber/30 text-amber",
  success: "bg-green-muted border-green/30 text-green",
  info:    "bg-cyan-muted border-cyan/30 text-cyan",
};

const LEVEL_ICONS: Record<AlertLevel, string> = {
  danger:  "🔴",
  warn:    "⚠",
  success: "✅",
  info:    "💬",
};

function buildAlerts(goals: Goal[], summary: SpendingSummary[]): Alert[] {
  const alerts: Alert[] = [];

  // Spending over-budget alerts
  const BUDGETS: Record<string, number> = {
    Groceries: 3000, Transport: 2000, "Dining Out": 3000,
    Subscriptions: 2000, Utilities: 2000,
  };
  summary.forEach((row) => {
    const budget = BUDGETS[row.category];
    if (!budget) return;
    const pct = row.total / budget;
    if (pct >= 1) {
      alerts.push({
        id: `over-${row.category}`,
        level: "danger",
        icon: LEVEL_ICONS.danger,
        message: `${row.category} is over budget (R${row.total.toFixed(0)} / R${budget})`,
      });
    } else if (pct >= 0.8) {
      alerts.push({
        id: `warn-${row.category}`,
        level: "warn",
        icon: LEVEL_ICONS.warn,
        message: `${row.category} at ${Math.round(pct * 100)}% of budget`,
      });
    }
  });

  // Goals nearing deadline
  goals.forEach((g) => {
    if (g.completed || !g.deadline) return;
    const days = Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000);
    if (days < 0) {
      alerts.push({
        id: `overdue-${g.id}`,
        level: "danger",
        icon: LEVEL_ICONS.danger,
        message: `Goal "${g.title}" is overdue by ${Math.abs(days)} days`,
      });
    } else if (days <= 7) {
      alerts.push({
        id: `deadline-${g.id}`,
        level: "warn",
        icon: LEVEL_ICONS.warn,
        message: `Goal "${g.title}" is due in ${days} days`,
      });
    }

    // Goal almost complete
    if (g.progress_pct >= 90 && !g.completed) {
      alerts.push({
        id: `almost-${g.id}`,
        level: "success",
        icon: LEVEL_ICONS.success,
        message: `"${g.title}" is ${g.progress_pct}% complete — almost there!`,
      });
    }
  });

  if (alerts.length === 0) {
    alerts.push({
      id: "all-good",
      level: "info",
      icon: LEVEL_ICONS.info,
      message: "All good — no alerts right now. Keep the streak going! 🔥",
    });
  }

  return alerts;
}

export function AlertPanel({ goals, summary }: { goals: Goal[]; summary: SpendingSummary[] }) {
  const initial = buildAlerts(goals, summary);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = initial.filter((a) => !dismissed.has(a.id));

  return (
    <div className="bg-bg-2 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] uppercase tracking-widest text-ink-2">Smart Alerts</h2>
        {dismissed.size < initial.length && (
          <button
            onClick={() => setDismissed(new Set(initial.map((a) => a.id)))}
            className="text-[10px] text-muted hover:text-ink-2 transition-colors"
          >
            dismiss all
          </button>
        )}
      </div>

      <div className="space-y-2">
        {visible.length === 0 ? (
          <p className="text-[11px] text-muted py-1">All clear.</p>
        ) : (
          visible.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "flex items-start gap-2 px-3 py-2 rounded border text-[11px]",
                LEVEL_STYLES[alert.level]
              )}
            >
              <span className="flex-shrink-0 mt-px">{alert.icon}</span>
              <span className="flex-1 leading-snug">{alert.message}</span>
              <button
                onClick={() => setDismissed((p) => new Set([...p, alert.id]))}
                className="flex-shrink-0 opacity-40 hover:opacity-80 transition-opacity text-xs"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}