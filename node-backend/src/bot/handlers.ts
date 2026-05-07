import { Context } from "grammy";
import { ParsedMessage } from "../ai/brain";
import {
  logTransaction, getGoals, createGoal,
  getSpendingSummary, getDailyStatus, completeDailyGoal,
} from "../services/finance";
import { awardXP, buildXPMessage } from "../services/gamification";
import { config } from "../config";

const userId = config.defaultUserId;

const DIFFICULTY_EMOJI: Record<string, string> = {
  EASY: "🟢", MEDIUM: "🟡", HARD: "🔴",
};

export async function handleParsed(ctx: Context, parsed: ParsedMessage) {
  switch (parsed.intent) {
    case "LOG_EXPENSE":     return handleLogExpense(ctx, parsed);
    case "SET_GOAL":        return handleSetGoal(ctx, parsed);
    case "QUERY_GOALS":     return handleQueryGoals(ctx);
    case "QUERY_SPENDING":  return handleQuerySpending(ctx);
    case "DAILY_COMPLETE":  return handleDailyComplete(ctx, parsed);
    case "DAILY_STATUS":    return handleDailyStatus(ctx);
    case "HELP":            return handleHelp(ctx);
    default:
      await ctx.reply(parsed.replyText || "Type *help* to see commands.", { parse_mode: "Markdown" });
  }
}

async function handleLogExpense(ctx: Context, parsed: ParsedMessage) {
  if (!parsed.amount || !parsed.merchant) {
    await ctx.reply("Need an amount and merchant. Try: *log R150 Woolworths*", { parse_mode: "Markdown" });
    return;
  }
  try {
    await logTransaction({ userId, amount: parsed.amount, merchant: parsed.merchant, category: parsed.category });
    const xp = await awardXP(userId, "LOG_EXPENSE");
    await ctx.reply(`✅ Logged: R${parsed.amount} at ${parsed.merchant} (${parsed.category ?? "Other"})\n${buildXPMessage(xp)}`);
  } catch {
    await ctx.reply("Couldn't save that. Is the finance API running?");
  }
}

async function handleSetGoal(ctx: Context, parsed: ParsedMessage) {
  if (!parsed.goalTarget) {
    await ctx.reply("Need a target amount. Try: *save R10000 hard by December*", { parse_mode: "Markdown" });
    return;
  }
  try {
    const difficulty = parsed.goalDifficulty ?? "MEDIUM";
    const XP_MAP = { EASY: 50, MEDIUM: 150, HARD: 300 };
    const goal = await createGoal({
      userId,
      title: parsed.goalTitle ?? "New Goal",
      type: parsed.goalType ?? "CUSTOM",
      difficulty,
      targetValue: parsed.goalTarget,
      deadline: parsed.goalDeadline,
    });
    const emoji = DIFFICULTY_EMOJI[difficulty];
    const xp = await awardXP(userId, "SET_GOAL");
    await ctx.reply(
      `🎯 Goal created!\n*${goal.title}*\n${emoji} ${difficulty} · ${XP_MAP[difficulty]} XP on completion\nTarget: R${goal.target_value}${goal.deadline ? `\nDeadline: ${new Date(goal.deadline).toLocaleDateString("en-ZA")}` : ""}\n\n${buildXPMessage(xp)}`,
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply("Couldn't create goal. Is the finance API running?");
  }
}

async function handleQueryGoals(ctx: Context) {
  try {
    const goals = await getGoals(userId, false);
    if (!goals.length) {
      await ctx.reply("No active goals. Set one with: *save R10000 hard by December*", { parse_mode: "Markdown" });
      return;
    }
    const lines = goals.map((g: any) => {
      const bar = progressBar(g.progress_pct);
      const emoji = DIFFICULTY_EMOJI[g.difficulty] ?? "🎯";
      return `${emoji} *${g.title}*\n${bar} ${g.progress_pct}% · R${g.current_value}/R${g.target_value}`;
    });
    await ctx.reply(`Your goals:\n\n${lines.join("\n\n")}`, { parse_mode: "Markdown" });
  } catch {
    await ctx.reply("Couldn't fetch goals right now.");
  }
}

async function handleQuerySpending(ctx: Context) {
  try {
    const summary = await getSpendingSummary(userId);
    if (!summary.length) {
      await ctx.reply("No spending data yet. Try: *log R200 Pick n Pay*", { parse_mode: "Markdown" });
      return;
    }
    const total = summary.reduce((s: number, r: any) => s + r.total, 0);
    const lines = summary.slice(0, 6).map((r: any) => `  ${r.category}: R${r.total.toFixed(0)}`);
    await ctx.reply(`📊 This month:\n\n${lines.join("\n")}\n\n*Total: R${total.toFixed(0)}*`, { parse_mode: "Markdown" });
  } catch {
    await ctx.reply("Couldn't fetch spending right now.");
  }
}

async function handleDailyComplete(ctx: Context, parsed: ParsedMessage) {
  if (!parsed.dailyGoalKey) {
    await ctx.reply("Which goal? Try: *done gym* or *finished reading*");
    return;
  }
  try {
    const result = await completeDailyGoal(userId, parsed.dailyGoalKey);
    await ctx.reply(`${result.message}\nTotal XP: ${result.new_xp_total} · Level ${result.new_level}${result.leveled_up ? " 🎉 LEVEL UP!" : ""}`);
  } catch (err: any) {
    if (err?.response?.status === 400) {
      await ctx.reply("Already marked as done today! 👍");
    } else {
      await ctx.reply("Couldn't log that. Is the finance API running?");
    }
  }
}

async function handleDailyStatus(ctx: Context) {
  try {
    const status = await getDailyStatus(userId);
    const lines = status.goals.map((g: any) =>
      `${g.completed ? "✅" : "⬜"} ${g.title} (+${g.xp_gain} / -${g.xp_loss} XP)`
    );
    const done = status.goals.filter((g: any) => g.completed).length;
    await ctx.reply(
      `📅 *Today's goals* (${done}/${status.goals.length} done)\n\n${lines.join("\n")}\n\nXP today: ${status.total_xp_today > 0 ? "+" : ""}${status.total_xp_today}`,
      { parse_mode: "Markdown" }
    );
  } catch {
    await ctx.reply("Couldn't fetch daily goals.");
  }
}

async function handleHelp(ctx: Context) {
  await ctx.reply(
    `*MonoxBot Commands*\n\n` +
    `💰 *Expenses*\n` +
    `  log R250 Woolworths\n` +
    `  spent R150 Uber\n\n` +
    `🎯 *Goals*\n` +
    `  save R10000 hard by December\n` +
    `  show goals\n\n` +
    `📅 *Daily Goals*\n` +
    `  daily (see today's goals)\n` +
    `  done gym\n` +
    `  finished reading\n` +
    `  did code\n\n` +
    `📊 *Stats*\n` +
    `  spending\n` +
    `  how am I doing`,
    { parse_mode: "Markdown" }
  );
}

function progressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}