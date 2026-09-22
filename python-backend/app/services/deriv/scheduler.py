"""
Deriv trading scheduler.

Volatility 25 Index trades 24/7 — no market hours restriction.
Scans every 15 minutes, morning briefing at 08:00 SAST,
daily summary at 17:30 SAST.
"""
import logging
import os
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.services.deriv.client import DerivClient
from app.services.deriv.trader import DerivTrader
from app.services.forex.v2.risk import RiskConfig
from app.config import settings

logger = logging.getLogger(__name__)

_trader: Optional[DerivTrader] = None


def get_deriv_trader() -> Optional[DerivTrader]:
    return _trader


async def setup_deriv_trader(notify_callback=None) -> Optional[DerivTrader]:
    """
    Initialise DerivTrader from settings.
    Called during FastAPI lifespan startup.
    """
    global _trader

    api_token = settings.deriv_api_token
    if not api_token:
        logger.warning(
            "DERIV_API_TOKEN not set — trading disabled. "
            "Add DERIV_API_TOKEN to your .env file."
        )
        return None

    client = DerivClient(api_token=api_token)

    risk_config = RiskConfig(
        risk_per_trade_pct  = settings.risk_per_trade_pct,
        max_open_trades     = settings.max_open_trades,
        max_daily_loss_pct  = settings.max_daily_loss_pct,
        min_confidence      = 0.45,
        sl_atr_multiplier   = 1.5,
        tp_atr_multiplier   = 3.0,
    )

    _trader = DerivTrader(client=client, risk_config=risk_config)
    if notify_callback:
        _trader.set_notify(notify_callback)

    # Connect at startup
    ok, msg = await _trader.start()
    if not ok:
        logger.error(f"Deriv connection failed at startup: {msg}")
        return None

    logger.info("DerivTrader initialised and connected")
    return _trader


def add_deriv_jobs(scheduler: AsyncIOScheduler, trader: DerivTrader):
    """Add Deriv trading jobs to an existing APScheduler instance."""

    # 08:00 SAST — morning briefing + first scan
    scheduler.add_job(
        trader.send_morning_briefing,
        CronTrigger(hour=8, minute=0, timezone="Africa/Johannesburg"),
        id="deriv_morning",
    )

    # Every 15 minutes 24/7 — V25 never closes
    scheduler.add_job(
        trader.run_scan,
        CronTrigger(minute="0,15,30,45"),
        id="deriv_scan",
    )

    # 17:30 SAST — daily summary
    scheduler.add_job(
        trader.send_daily_summary,
        CronTrigger(hour=17, minute=30, timezone="Africa/Johannesburg"),
        id="deriv_summary",
    )

    logger.info("✅ Deriv trading jobs scheduled (15min scan, 24/7)")