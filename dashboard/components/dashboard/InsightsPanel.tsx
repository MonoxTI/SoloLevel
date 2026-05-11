"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Insight {
  id: string;
  type: string;
  severity: string;
  category: string | null;
  title: string;
  body: string;
  value: number | null;
  confidence: number | null;
  read: boolean;
  generated_at: string;
}

const SEVERITY_STYLES = {
  ALERT:   "border-red/30 bg-red-muted text-red",
  WARNING: "border-amber/30 bg-amber-muted text-amber",
  INFO:    "border-cyan/30 bg-cyan-muted text-cyan",
};

const TYPE_ICONS: Record<string, string> = {
  ANOMALY:          "🚨",
  PREDICTION:       "📈",
  TREND:            "📊",
  GOAL_PACE:        "🎯",
  GOAL_PROBABILITY: "🎲",
};

const TYPE_LABELS: Record<string, string> = {
  ANOMALY:          "Anomaly",
  PREDICTION:       "Forecast",
  TREND:            "Trend",
  GOAL_PACE:        "Goal Pace",
  GOAL_PROBABILITY: "Probability",
};

export function InsightsPanel({ insights, userId }: { insights: Insight[]; userId: string }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = insights.filter(i => !dismissed.has(i.id));

  async function markRead(id: string) {
    setDismissed(p => new Set([...p, id]));
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/insights/${id}/read`, {
        method: "PATCH",
      });
    } catch {}
  }

  if (insights.length === 0) {
    return (
      <div className="bg-bg-2 border border-border rounded-lg p-4">
        <h2 className="text-[10px] uppercase tracking-widest text-ink-2 mb-3">ML Insights</h2>
        <p className="text-xs text-ink-2 py-2">
          No insights yet. Generated every Sunday — keep logging transactions to build history.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-bg-2 border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] uppercase tracking-widest text-ink-2">ML Insights</h2>
          {visible.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-muted text-cyan border border-cyan/30">
              {visible.length} new
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted">
          {new Date(insights[0]?.generated_at).toLocaleDateString("en-ZA")}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-muted py-1">All caught up!</p>
      ) : (
        <div className="space-y-2">
          {visible.map(insight => (
            <div
              key={insight.id}
              className={cn(
                "rounded-lg border p-3 transition-all cursor-pointer",
                SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.INFO
              )}
              onClick={() => setExpanded(expanded === insight.id ? null : insight.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <span className="text-sm flex-shrink-0 mt-px">
                    {TYPE_ICONS[insight.type] ?? "💡"}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="text-[9px] opacity-70 uppercase tracking-wider">
                        {TYPE_LABELS[insight.type] ?? insight.type}
                      </span>
                      {insight.confidence && (
                        <span className="text-[9px] opacity-60">
                          {(insight.confidence * 100).toFixed(0)}% confidence
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-medium leading-snug">{insight.title}</p>
                    {expanded === insight.id && (
                      <p className="text-[11px] opacity-80 mt-1.5 leading-relaxed">
                        {insight.body}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); markRead(insight.id); }}
                  className="text-[10px] opacity-50 hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted mt-3">
        Click an insight to expand · Dismiss to archive
      </p>
    </div>
  );
}