"""
Midnight miss-penalty scheduler.

Runs at 23:59 SAST every day (Mon–Sun).
For every daily goal that was NOT completed today, fires the miss endpoint
which deducts XP and writes a log row.

This keeps the penalty logic in one place (the daily_goals router) rather
than duplicating it here. We call our own API over HTTP so the DB session,
XP calc, and logging all happen through the same path the Telegram bot uses.
"""
import logging
import os

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.models.daily_goal import DAILY_GOALS

logger = logging.getLogger(__name__)


async def apply_daily_miss_penalties():
    """
    Called at 23:59 SAST.
    Loops all 4 daily goals and hits /daily-goals/{key}/miss for any not completed.
    The endpoint is idempotent for already-completed goals (returns 400 which we swallow).
    """
    user_id = os.getenv("DEFAULT_USER_ID", "")
    if not user_id:
        logger.warning("DEFAULT_USER_ID not set — skipping miss penalty run")
        return

    base_url = os.getenv("PYTHON_API_URL", "http://localhost:8000")
    penalties_applied = 0
    skipped = 0

    logger.info(f"Running midnight miss-penalty check for user {user_id}")

    async with httpx.AsyncClient(timeout=10) as client:
        for goal in DAILY_GOALS:
            key = goal["key"]
            try:
                resp = await client.post(
                    f"{base_url}/daily-goals/{key}/miss",
                    params={"user_id": user_id},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    logger.info(
                        f"Miss penalty applied: {key} | {data.get('xp_change', 0)} XP "
                        f"(total: {data.get('new_xp_total', '?')})"
                    )
                    penalties_applied += 1
                elif resp.status_code == 400:
                    # "Goal was completed — no penalty" or "already processed"
                    skipped += 1
                else:
                    logger.warning(f"Unexpected response for {key}: {resp.status_code} {resp.text}")
            except Exception as e:
                logger.error(f"Failed to apply miss penalty for {key}: {e}")

    summary = (
        f"🌙 Midnight check complete — "
        f"{penalties_applied} penalties applied, {skipped} goals completed today."
    )
    logger.info(summary)

    # Notify Telegram if there were any penalties
    if penalties_applied > 0:
        node_url = os.getenv("NODE_BACKEND_URL", "http://localhost:3001")
        missed_names = []
        async with httpx.AsyncClient(timeout=5) as client:
            for goal in DAILY_GOALS:
                key = goal["key"]
                try:
                    resp = await client.post(
                        f"{base_url}/daily-goals/{key}/miss",
                        params={"user_id": user_id},
                    )
                    if resp.status_code == 200:
                        missed_names.append(goal["title"])
                except Exception:
                    pass

        msg_lines = ["⏰ *Daily goal deadline reached*\n"]
        if missed_names:
            msg_lines.append("❌ Missed today:")
            for name in missed_names:
                goal_def = next((g for g in DAILY_GOALS if g["title"] == name), None)
                loss = goal_def["xp_loss"] if goal_def else "?"
                msg_lines.append(f"  · {name} (-{loss} XP)")
        msg_lines.append(f"\nComplete them earlier tomorrow to keep your streak.")

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(
                    f"{node_url}/notify",
                    json={"message": "\n".join(msg_lines)},
                )
        except Exception as e:
            logger.warning(f"Failed to send miss penalty Telegram notification: {e}")


def add_miss_penalty_job(scheduler: AsyncIOScheduler):
    """Add the midnight miss-penalty job to an existing scheduler."""
    scheduler.add_job(
        apply_daily_miss_penalties,
        CronTrigger(
            hour=23,
            minute=59,
            timezone="Africa/Johannesburg",
        ),
        id="daily_miss_penalties",
    )
    logger.info("✅ Midnight miss-penalty job scheduled — 23:59 SAST daily")