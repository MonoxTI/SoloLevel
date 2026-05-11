"""
Weekly ML scheduler — runs every Sunday at 20:00 SAST.
Generates insights and pushes digest to Telegram via Node backend.
"""
import logging
import os
import httpx
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.db.database import AsyncSessionLocal
from app.services.ml.engine import run_weekly_analysis, format_insights_for_telegram

logger = logging.getLogger(__name__)


async def run_weekly_insights():
    """Called by scheduler every Sunday at 20:00 SAST."""
    user_id = os.getenv("DEFAULT_USER_ID", "")
    if not user_id:
        logger.warning("DEFAULT_USER_ID not set — skipping ML analysis")
        return

    logger.info(f"Running weekly ML insights for user {user_id}")

    async with AsyncSessionLocal() as db:
        insights = await run_weekly_analysis(user_id, db)
        message  = format_insights_for_telegram(insights)

    # Push to Telegram via Node backend
    node_url = os.getenv("NODE_BACKEND_URL", "http://localhost:3001")
    try:
        async with httpx.AsyncClient() as client:
            await client.post(f"{node_url}/notify", json={"message": message}, timeout=10)
        logger.info("Weekly insights sent to Telegram")
    except Exception as e:
        logger.warning(f"Failed to send insights to Telegram: {e}")


def add_ml_jobs(scheduler: AsyncIOScheduler):
    """Add ML jobs to an existing scheduler."""
    scheduler.add_job(
        run_weekly_insights,
        CronTrigger(
            day_of_week="sun",
            hour=20,
            minute=0,
            timezone="Africa/Johannesburg",
        ),
        id="weekly_ml_insights",
    )
    logger.info("✅ Weekly ML insights job scheduled — every Sunday 20:00 SAST")