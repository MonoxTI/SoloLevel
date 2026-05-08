import { prisma } from "../db/prisma";

const XP_REWARDS = {
  LOG_EXPENSE: 10,
  SET_GOAL:    25,
  DAILY_BONUS: 50,
} as const;

// Mirror of the Python XP curve — must stay in sync
const LEVEL_THRESHOLDS = [
  0, 500, 2000, 5000, 10000, 17500, 28000,
  42000, 60000, 82500, 110000, 142500, 180000, 222500, 270000,
];

const LEVEL_TITLES: Record<number, string> = {
  1: "Broke Beginner",    2: "Budget Tracker",
  3: "Saving Starter",    4: "Penny Pincher",
  5: "Cash Conscious",    6: "Finance Aware",
  7: "Money Manager",     8: "Wealth Builder",
  9: "Investment Initiate", 10: "Market Watcher",
  11: "Portfolio Pro",   12: "Finance Commander",
  13: "Wealth Strategist", 14: "Capital Master",
  15: "Solo Level MAX",
};

function calcLevel(xp: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return Math.min(level, LEVEL_THRESHOLDS.length);
}

function getProgress(xp: number, level: number) {
  const currentThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextThreshold = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const levelXp = xp - currentThreshold;
  const levelRange = nextThreshold - currentThreshold;
  const pct = levelRange > 0 ? Math.min(100, Math.round((levelXp / levelRange) * 100)) : 100;
  return { xp_into_level: levelXp, xp_needed_for_next: levelRange, progress_pct: pct };
}

export async function awardXP(userId: string, action: keyof typeof XP_REWARDS) {
  const xpGained = XP_REWARDS[action];
  const user = await prisma.user.update({
    where: { id: userId },
    data: { xp: { increment: xpGained }, lastActive: new Date() },
  });

  const oldLevel = calcLevel(user.xp - xpGained);
  const newLevel = calcLevel(user.xp);
  const leveledUp = newLevel > oldLevel;

  if (newLevel !== user.level) {
    await prisma.user.update({ where: { id: userId }, data: { level: newLevel } });
  }

  const progress = getProgress(user.xp, newLevel);

  return {
    xpGained,
    newTotal: user.xp,
    newLevel,
    levelTitle: LEVEL_TITLES[newLevel] ?? "Legend",
    leveledUp,
    progress,
  };
}

export function buildXPMessage(result: ReturnType<typeof awardXP> extends Promise<infer T> ? T : never): string {
  return `+${result.xpGained} XP · Total: ${result.newTotal} (Level ${result.newLevel})`;
}