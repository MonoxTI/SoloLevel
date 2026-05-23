import { Context } from "grammy";
import { ParsedMessage } from "../ai/brain";
import {
  logTransaction, getGoals, createGoal, getSpendingSummary,
  getDailyStatus, completeDailyGoal,
  setNetWorth, getNetWorth, logIncome,
  getTradingSignal,
} from "../services/finance";
import { awardXP, buildXPMessage } from "../services/gamification";
import { config } from "../config";

const userId = config.defaultUserId;

const DIFFICULTY_EMOJI: Record<string, string> = {
  EASY: "🟢", MEDIUM: "🟡", HARD: "🔴",
};

function levelUpMsg(result: any): string {
  return `\n\n🎉 *LEVEL UP!* You are now *Level ${result.newLevel}* — ${result.levelTitle}`;
}

function progressBar(pct: number): string {
  const filled = Math.round(Math.min(100, pct) / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function formatZAR(n: number): string {
  return `R${Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export async function handleParsed(ctx: Context, parsed: ParsedMessage) {
  console.log(`[HANDLER] intent=${parsed.intent} userId=${userId}`);

  if (!userId) {
    await ctx.reply("⚠️ DEFAULT_USER_ID is not set in .env — the bot doesn't know who you are.");
    return;
  }

  switch (parsed.intent) {
    case "LOG_EXPENSE":     return handleLogExpense(ctx, parsed);
    case "LOG_INCOME":      return handleLogIncome(ctx, parsed);
    case "SET_GOAL":        return handleSetGoal(ctx, parsed);
    case "QUERY_GOALS":     return handleQueryGoals(ctx);
    case "QUERY_SPENDING":  return handleQuerySpending(ctx);
    case "SET_NET_WORTH":   return handleSetNetWorth(ctx, parsed);
    case "QUERY_NET_WORTH": return handleQueryNetWorth(ctx);
    case "QUERY_SIGNALS":   return handleSignals(ctx, parsed);
    case "DAILY_COMPLETE":  return handleDailyComplete(ctx, parsed);
    case "DAILY_STATUS":    return handleDailyStatus(ctx);
    case "HELP":            return handleHelp(ctx);
    default:
      await ctx.reply(parsed.replyText || "Type *help* to see commands.", { parse_mode: "Markdown" });
  }
}

async function handleLogExpense(ctx: Context, parsed: ParsedMessage) {
  if (!parsed.amount || !parsed.merchant) {
    await ctx.reply("Need an amount and merchant.\nTry: *log R150 Woolworths*", { parse_mode: "Markdown" });
    return;
  }
  try {
    await logTransaction({ userId, amount: parsed.amount, merchant: parsed.merchant, category: parsed.category });
    const xp = await awardXP(userId, "LOG_EXPENSE");
    await ctx.reply(
      `✅ Logged: ${formatZAR(parsed.amount)} at ${parsed.merchant} (${parsed.category ?? "Other"})` +
      (xp.leveledUp ? levelUpMsg(xp) : ""),
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    console.error("[HANDLER] logExpense error:", err?.response?.data ?? err?.message ?? err);
    await ctx.reply(`❌ Couldn't save that transaction.\nError: ${err?.message ?? "unknown"}`);
  }
}

async function handleLogIncome(ctx: Context, parsed: ParsedMessage) {
  if (!parsed.amount) {
    await ctx.reply("Need an amount.\nTry: *income R5000 salary*", { parse_mode: "Markdown" });
    return;
  }
  try {
    await logIncome({ userId, amount: parsed.amount, merchant: parsed.merchant ?? "Income" });
    const xp = await awardXP(userId, "LOG_EXPENSE");
    await ctx.reply(
      `💰 Income logged: ${formatZAR(parsed.amount)}\nNet worth updated automatically.`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    console.error("[HANDLER] logIncome error:", err?.response?.data ?? err?.message ?? err);
    await ctx.reply(`❌ Couldn't log income.\nError: ${err?.message ?? "unknown"}`);
  }
}

async function handleSetNetWorth(ctx: Context, parsed: ParsedMessage) {
  if (!parsed.amount) {
    await ctx.reply("Need an amount.\nTry: *set net worth R50000*", { parse_mode: "Markdown" });
    return;
  }
  try {
    const nw = await setNetWorth({ userId, baseValue: parsed.amount });
    await ctx.reply(
      `💎 Net worth set to *${formatZAR(nw.current_value)}*\n` +
      `Yearly budget goal: ${formatZAR(nw.yearly_budget_goal)}\n` +
      `Every expense you log will now adjust this automatically.`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    console.error("[HANDLER] setNetWorth error:", err?.response?.data ?? err?.message ?? err);
    await ctx.reply(`❌ Couldn't set net worth.\nError: ${err?.message ?? "unknown"}`);
  }
}

async function handleQueryNetWorth(ctx: Context) {
  try {
    const nw = await getNetWorth(userId);
    const bar = progressBar(nw.budget_progress_pct);
    await ctx.reply(
      `💎 *Net Worth*\n\n` +
      `Current: *${formatZAR(nw.current_value)}*\n` +
      `Base: ${formatZAR(nw.base_value)}\n\n` +
      `📊 *Yearly goal: ${formatZAR(nw.yearly_budget_goal)}*\n` +
      `${bar} ${nw.budget_progress_pct}%\n` +
      `Saved: ${formatZAR(nw.saved_this_year)} · Remaining: ${formatZAR(nw.budget_remaining)}`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    if (err?.response?.status === 404) {
      await ctx.reply("No net worth set yet.\nTry: *set net worth R50000*", { parse_mode: "Markdown" });
    } else {
      console.error("[HANDLER] getNetWorth error:", err?.message);
      await ctx.reply("❌ Couldn't fetch net worth.");
    }
  }
}

async function handleSignals(ctx: Context, parsed: ParsedMessage) {
  await ctx.reply("📡 Scanning forex pairs... (~10 seconds)");
  try {
    const signals = await getTradingSignal(parsed.symbol);
    const top = signals.slice(0, 5);
    const emoji: Record<string, string> = { BUY: "🟢", SELL: "🔴", HOLD: "🟡", ERROR: "⚪" };
    const lines = top.map((s: any) =>
      `${emoji[s.signal ?? s.recommendation] ?? "⚪"} *${s.symbol}* — ${s.signal ?? s.recommendation}\n` +
      `  Price: ${s.price ?? "N/A"} · RSI: ${s.rsi ?? "?"} · Score: ${s.score ?? 0}`
    );
    await ctx.reply(
      `📈 *Forex Signals*\n\n${lines.join("\n\n")}\n\n_RSI + MACD + EMA + Breakout + Pullback_`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    console.error("[HANDLER] signals error:", err?.message);
    await ctx.reply("❌ Couldn't fetch signals. Is the Python API running?");
  }
}

async function handleSetGoal(ctx: Context, parsed: ParsedMessage) {
  if (!parsed.goalTarget) {
    await ctx.reply("Need a target amount.\nTry: *save R10000 hard by December*", { parse_mode: "Markdown" });
    return;
  }
  try {
    const difficulty = parsed.goalDifficulty ?? "MEDIUM";
    const XP_MAP: Record<string, number> = { EASY: 50, MEDIUM: 150, HARD: 300 };
    const goal = await createGoal({
      userId, title: parsed.goalTitle ?? "New Goal",
      type: parsed.goalType ?? "CUSTOM", difficulty,
      targetValue: parsed.goalTarget, deadline: parsed.goalDeadline,
    });
    const xp = await awardXP(userId, "SET_GOAL");
    await ctx.reply(
      `🎯 Goal created!\n*${goal.title}*\n${DIFFICULTY_EMOJI[difficulty]} ${difficulty} · ${XP_MAP[difficulty]} XP on completion\n` +
      `Target: ${formatZAR(goal.target_value)}` +
      (goal.deadline ? `\nDeadline: ${new Date(goal.deadline).toLocaleDateString("en-ZA")}` : "") +
      `\n\n${buildXPMessage(xp)}` + (xp.leveledUp ? levelUpMsg(xp) : ""),
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    console.error("[HANDLER] setGoal error:", err?.response?.data ?? err?.message ?? err);
    await ctx.reply(`❌ Couldn't create goal.\nError: ${err?.message ?? "unknown"}`);
  }
}

async function handleQueryGoals(ctx: Context) {
  try {
    const goals = await getGoals(userId, false);
    if (!goals.length) {
      await ctx.reply("No active goals yet.\nTry: *save R10000 hard by December*", { parse_mode: "Markdown" });
      return;
    }
    const lines = goals.map((g: any) =>
      `${DIFFICULTY_EMOJI[g.difficulty] ?? "🎯"} *${g.title}*\n` +
      `${progressBar(g.progress_pct)} ${g.progress_pct}%\n` +
      `${formatZAR(g.current_value)} / ${formatZAR(g.target_value)} · ${g.xp_reward} XP`
    );
    await ctx.reply(`Your goals:\n\n${lines.join("\n\n")}`, { parse_mode: "Markdown" });
  } catch (err: any) {
    console.error("[HANDLER] queryGoals error:", err?.message);
    await ctx.reply("❌ Couldn't fetch goals. Is the Python API running?");
  }
}

async function handleQuerySpending(ctx: Context) {
  try {
    const summary = await getSpendingSummary(userId);
    if (!summary.length) {
      await ctx.reply("No spending data yet.\nTry: *log R200 Pick n Pay*", { parse_mode: "Markdown" });
      return;
    }
    const total = summary.reduce((s: number, r: any) => s + r.total, 0);
    const lines = summary.slice(0, 6).map((r: any) => `  ${r.category}: ${formatZAR(r.total)}`);
    await ctx.reply(`📊 This month:\n\n${lines.join("\n")}\n\n*Total: ${formatZAR(total)}*`, { parse_mode: "Markdown" });
  } catch (err: any) {
    console.error("[HANDLER] querySpending error:", err?.message);
    await ctx.reply("❌ Couldn't fetch spending. Is the Python API running?");
  }
}

async function handleDailyComplete(ctx: Context, parsed: ParsedMessage) {
  if (!parsed.dailyGoalKey) {
    await ctx.reply("Which goal?\nTry: *done gym* · *done code* · *done maths* · *done reading*");
    return;
  }
  try {
    const result = await completeDailyGoal(userId, parsed.dailyGoalKey);
    const bar = progressBar(result.progress?.progress_pct ?? 0);
    let msg = `${result.message}\n*${result.new_xp_total} XP* · Level *${result.new_level}* — ${result.level_title}`;
    if (result.leveled_up) msg += levelUpMsg({ newLevel: result.new_level, levelTitle: result.level_title });
    if (result.progress) msg += `\n\n${bar} ${result.progress.progress_pct}% to Level ${result.new_level + 1}`;
    await ctx.reply(msg, { parse_mode: "Markdown" });
  } catch (err: any) {
    if (err?.response?.status === 400) {
      await ctx.reply("Already done today! 👍");
    } else {
      console.error("[HANDLER] dailyComplete error:", err?.message);
      await ctx.reply("❌ Couldn't log that. Is the Python API running?");
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
    const xpText = status.total_xp_today >= 0 ? `+${status.total_xp_today}` : `${status.total_xp_today}`;
    await ctx.reply(
      `📅 *Today's goals* (${done}/${status.goals.length} done)\n\n` +
      `${lines.join("\n")}\n\nXP today: *${xpText}*`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    console.error("[HANDLER] dailyStatus error:", err?.message);
    await ctx.reply("❌ Couldn't fetch daily goals. Is the Python API running?");
  }
}

async function handleHelp(ctx: Context) {
  await ctx.reply(
    `*MonoxBot Commands*\n\n` +
    `💰 *Expenses*\n` +
    `  log R250 Woolworths\n` +
    `  spent R150 Uber\n` +
    `  paid R500 doctor\n\n` +
    `💵 *Income*\n` +
    `  income R5000 salary\n` +
    `  received R3000 freelance\n\n` +
    `💎 *Net Worth*\n` +
    `  set net worth R50000\n` +
    `  net worth\n\n` +
    `🎯 *Goals*\n` +
    `  save R1000 easy\n` +
    `  save R5000 medium by December\n` +
    `  save R10000 hard by August\n` +
    `  show goals\n\n` +
    `📅 *Daily Goals*\n` +
    `  daily\n` +
    `  done gym · done code · done maths · done reading\n\n` +
    `📈 *Trading*\n` +
    `  signals\n` +
    `  check EURUSD\n\n` +
    `📊 *Stats*\n` +
    `  spending\n` +
    `  budget`,
    { parse_mode: "Markdown" }
  );
}