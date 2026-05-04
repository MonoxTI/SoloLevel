import { prisma } from "../db/prisma";

const XP_REWARDS = {
  LOG_EXPENSE: 10,
  SET_GOAL: 25,
  COMPLETE_GOAL: 100,
  DAILY_STREAK: 50,
  UNDER_BUDGET: 75,
} as const;

const LEVEL_THRESHOLDS = [0, 500, 1500, 3000, 5500, 9000, 14000, 20000];

function calcLevel(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export async function awardXP(
  userId: string,
  action: keyof typeof XP_REWARDS
): Promise<{ xpGained: number; newTotal: number; newLevel: number; leveledUp: boolean }> {
  const xpGained = XP_REWARDS[action];

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      xp: { increment: xpGained },
      lastActive: new Date(),
    },
  });

  const oldLevel = calcLevel(user.xp - xpGained);
  const newLevel = calcLevel(user.xp);

  if (newLevel !== user.level) {
    await prisma.user.update({ where: { id: userId }, data: { level: newLevel } });
  }

  return {
    xpGained,
    newTotal: user.xp,
    newLevel,
    leveledUp: newLevel > oldLevel,
  };
}

export async function updateStreak(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return 0;

  const now = new Date();
  const lastActive = user.lastActive;
  const daysSince = lastActive
    ? Math.floor((now.getTime() - lastActive.getTime()) / 86400000)
    : 999;

  let newStreak = user.streak;
  if (daysSince === 1) {
    newStreak += 1;
  } else if (daysSince > 1) {
    newStreak = 1; // reset streak
  }

  await prisma.user.update({
    where: { id: userId },
    data: { streak: newStreak, lastActive: now },
  });

  return newStreak;
}

export function buildXPMessage(result: {
  xpGained: number;
  newTotal: number;
  newLevel: number;
  leveledUp: boolean;
}): string {
  let msg = `+${result.xpGained} XP (total: ${result.newTotal})`;
  if (result.leveledUp) {
    msg += ` 🎉 Level up! You're now Level ${result.newLevel}!`;
  }
  return msg;
}