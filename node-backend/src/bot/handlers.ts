import { Context } from "grammy";
import { ParsedMessage } from "../ai/brain";
import { logTransaction, getGoals, createGoal, getSpendingSummary } from "../services/finance";
import { awardXP, buildXPMessage } from "../services/gamification";
import { config } from "../config";

const userId = config.defaultUserId;

export async function handleParsed(ctx: Context, parsed: ParsedMessage) {
  switch (parsed.intent) {
    case "LOG_EXPENSE":
      await handleLogExpense(ctx, parsed);
      break;
    case "SET_GOAL":
      await handleSetGoal(ctx, parsed);
      break;
    case "QUERY_GOALS":
      await handleQueryGoals(ctx);
      break;
    case "QUERY_SPENDING":
      await handleQuerySpending(ctx);
      break;
    default:
      await ctx.reply(parsed.replyText);
  }
}

async function handleLogExpense(ctx: Context, parsed: ParsedMessage) {
  if (!parsed.amount || !parsed.merchant) {
    await ctx.reply("I need an amount and a merchant. Try: 'log R150 Woolworths'");
    return;
  }

  try {
    await logTransaction({
      userId,
      amount: parsed.amount,
      merchant: parsed.merchant,
      category: parsed.category,
      note: parsed.note,
    });

    const xp = await awardXP(userId, "LOG_EXPENSE");
    const xpMsg = buildXPMessage(xp);

    await ctx.reply(
      `✅ Logged: R${parsed.amount} at ${parsed.merchant} (${parsed.category ?? "Other"})\n${xpMsg}`
    );
  } catch (err) {
    console.error("logExpense error:", err);
    await ctx.reply("Couldn't save that transaction. Is the finance API running?");
  }
}

async function handleSetGoal(ctx: Context, parsed: ParsedMessage) {
  if (!parsed.goalTitle || !parsed.goalTarget) {
    await ctx.reply("I need a goal title and target amount. Try: 'Save R5000 by December'");
    return;
  }

  try {
    const goal = await createGoal({
      userId,
      title: parsed.goalTitle,
      type: parsed.goalType ?? "CUSTOM",
      targetValue: parsed.goalTarget,
      deadline: parsed.goalDeadline ?? undefined,
    });

    const xp = await awardXP(userId, "SET_GOAL");
    const xpMsg = buildXPMessage(xp);

    await ctx.reply(
      `🎯 Goal set: "${goal.title}"\nTarget: R${goal.target_value}${
        goal.deadline ? ` by ${new Date(goal.deadline).toLocaleDateString("en-ZA")}` : ""
      }\n${xpMsg}`
    );
  } catch (err) {
    console.error("setGoal error:", err);
    await ctx.reply("Couldn't create that goal. Is the finance API running?");
  }
}

async function handleQueryGoals(ctx: Context) {
  try {
    const goals = await getGoals(userId, false);

    if (!goals.length) {
      await ctx.reply("You have no active goals yet. Set one with: 'I want to save R10000 by March'");
      return;
    }

    const lines = goals.map((g: any) => {
      const bar = buildProgressBar(g.progress_pct);
      return `${g.completed ? "✅" : "🎯"} *${g.title}*\n${bar} ${g.progress_pct}%  (R${g.current_value} / R${g.target_value})`;
    });

    await ctx.reply(`Your active goals:\n\n${lines.join("\n\n")}`, { parse_mode: "Markdown" });
  } catch (err) {
    await ctx.reply("Couldn't fetch goals right now.");
  }
}

async function handleQuerySpending(ctx: Context) {
  try {
    const summary = await getSpendingSummary(userId);

    if (!summary.length) {
      await ctx.reply("No spending data this month yet. Start logging with: 'log R200 Pick n Pay'");
      return;
    }

    const total = summary.reduce((s: number, r: any) => s + r.total, 0);
    const lines = summary
      .slice(0, 6)
      .map((r: any) => `  ${r.category}: R${r.total.toFixed(0)} (${r.count} txns)`);

    await ctx.reply(`📊 Spending this month:\n\n${lines.join("\n")}\n\nTotal: R${total.toFixed(0)}`);
  } catch (err) {
    await ctx.reply("Couldn't fetch spending data right now.");
  }
}

function buildProgressBar(pct: number): string {
  const filled = Math.round(pct / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}