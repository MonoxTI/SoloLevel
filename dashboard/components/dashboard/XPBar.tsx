import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

const LEVEL_THRESHOLDS = [0, 500, 1500, 3000, 5500, 9000, 14000, 20000];

const BADGES = [
  { id: "saver",      label: "Consistent Saver",  icon: "🏆", minLevel: 2 },
  { id: "first_win",  label: "First Profit",       icon: "📈", minLevel: 3 },
  { id: "streak7",    label: "7-Day Streak",       icon: "🔥", minLevel: 2 },
  { id: "bot",        label: "Bot Whisperer",      icon: "🤖", minLevel: 4 },
  { id: "diamond",    label: "Diamond Hands",      icon: "💎", minLevel: 6 },
];

function getLevelProgress(xp: number, level: number) {
  const current = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const pct = Math.min(100, ((xp - current) / (next - current)) * 100);
  return { current, next, pct };
}

export function XPBar({ user }: { user: User }) {
  const { next, pct } = getLevelProgress(user.xp, user.level);

  return (
    <div className="bg-bg-2 border border-border rounded-lg p-4 flex items-center gap-5">
      {/* Level */}
      <div className="text-center min-w-[52px]">
        <div className="text-[10px] text-ink-2 tracking-widest uppercase">LVL</div>
        <div className="font-display text-4xl text-amber leading-tight">{user.level}</div>
      </div>

      {/* Bar + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-[10px] text-ink-2 mb-1.5">
          <span className="uppercase tracking-wide">Finance Commander</span>
          <span>{user.xp.toLocaleString()} / {next.toLocaleString()} XP</span>
        </div>

        {/* Progress track */}
        <div className="h-2 bg-bg-4 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-dim to-amber animate-fill-bar"
            style={{ "--target-width": `${pct}%` } as React.CSSProperties}
          />
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {BADGES.map((b) => {
            const earned = user.level >= b.minLevel;
            return (
              <span
                key={b.id}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded border",
                  earned
                    ? "text-amber border-amber/30 bg-amber-muted"
                    : "text-muted border-border bg-bg-4"
                )}
              >
                {b.icon} {b.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Streak */}
      <div className="text-center min-w-[64px] pl-4 border-l border-border">
        <div className="text-[10px] text-ink-2 tracking-widest uppercase mb-1">Streak</div>
        <div className="font-display text-4xl text-green leading-tight">
          {user.streak}
          <span className="text-green-dim text-lg">d</span>
        </div>
        <div className="text-[10px] text-muted mt-0.5">+50 XP/day</div>
      </div>
    </div>
  );
}