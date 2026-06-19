import { prisma } from "../db/prisma";
import { hoursElapsed } from "../services/notesAndTodos";
import { sendTelegramMessage } from "../webhooks/notify";

/**
 * Runs every hour. For every incomplete todo:
 *   - at 10h, 15h, 22h elapsed → send a one-time reminder
 *   - at 24h elapsed → delete it, regardless of completion status
 *
 * The reminded10h/15h/22h flags guarantee each threshold fires exactly once,
 * even if this job is delayed or the process restarts mid-cycle.
 */
export async function runTodoReminderCycle() {
  const todos = await prisma.todo.findMany({ where: { completed: false } });

  for (const todo of todos) {
    const hours = hoursElapsed(todo.createdAt);

    if (hours >= 24) {
      await prisma.todo.delete({ where: { id: todo.id } });
      console.log(`[TODO] Deleted (24h expired): "${todo.content}"`);
      continue;
    }

    if (hours >= 22 && !todo.reminded22h) {
      await sendReminder(todo.content, 22, hours);
      await prisma.todo.update({ where: { id: todo.id }, data: { reminded22h: true } });
    } else if (hours >= 15 && !todo.reminded15h) {
      await sendReminder(todo.content, 15, hours);
      await prisma.todo.update({ where: { id: todo.id }, data: { reminded15h: true } });
    } else if (hours >= 10 && !todo.reminded10h) {
      await sendReminder(todo.content, 10, hours);
      await prisma.todo.update({ where: { id: todo.id }, data: { reminded10h: true } });
    }
  }
}

async function sendReminder(content: string, threshold: number, hoursElapsed: number) {
  const hoursLeft = Math.max(0, Math.round(24 - hoursElapsed));
  try {
    await sendTelegramMessage(
      `⏰ *Todo reminder*\n\n` +
      `"${content}"\n\n` +
      `${hoursLeft}h left before this is auto-deleted.`
    );
  } catch (err) {
    console.error("[TODO] Reminder send failed:", err);
  }
}

/** Call once at startup — schedules the hourly check. */
export function startTodoScheduler() {
  // Run once immediately on boot, then every hour
  runTodoReminderCycle().catch(err => console.error("[TODO] Initial cycle failed:", err));
  setInterval(() => {
    runTodoReminderCycle().catch(err => console.error("[TODO] Cycle failed:", err));
  }, 60 * 60 * 1000);
  console.log("✅ Todo reminder scheduler started (hourly, 10h/15h/22h reminders, 24h expiry)");
}