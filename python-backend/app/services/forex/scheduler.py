"""
Trading scheduler — runs the auto trader on a timed loop.
Uses APScheduler. Integrated into FastAPI lifespan.

Schedule (SAST / Africa/Johannesburg):
  08:00 Mon-Fri  — morning briefing + first scan
  Every 15min    — pair scan (08:00–17:00)
  Every 5min     — trailing stop update (08:00–17:00)
  17:30 Mon-Fri  — daily summary
"""
import logging
import os

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.services.forex.broker.mt5_client import MT5Config
from app.services.forex.broker.auto_trader import AutoTrader
from app.services.forex.v2.risk import RiskConfig          # ← v2 RiskConfig

logger = logging.getLogger(__name__)

_trader: AutoTrader = None
_scheduler: AsyncIOScheduler = None


def get_trader() -> AutoTrader:
    return _trader


def setup_trader(notify_callback=None) -> AutoTrader:
    """
    Initialise the AutoTrader from environment variables.
    Call this during FastAPI startup.
    """
    global _trader

    login    = int(os.getenv("MT5_LOGIN", "0") or "0")
    password = os.getenv("MT5_PASSWORD", "").strip()
    server   = os.getenv("MT5_SERVER", "").strip()

    if not all([login, password, server]):
        logger.warning(
            "MT5 credentials not set — trading disabled. "
            "Set MT5_LOGIN, MT5_PASSWORD, MT5_SERVER in .env"
        )
        return None

    mt5_config = MT5Config(login=login, password=password, server=server)

    risk_config = RiskConfig(
        risk_per_trade_pct  = float(os.getenv("RISK_PER_TRADE_PCT",  "1.0")),
        max_open_trades     = int(os.getenv("MAX_OPEN_TRADES",       "3")),
        max_daily_loss_pct  = float(os.getenv("MAX_DAILY_LOSS_PCT",  "5.0")),
        min_confidence      = 0.60,   # v2: require higher confidence before trading live
        sl_atr_multiplier   = 1.5,
        tp_atr_multiplier   = 3.0,
    )

    _trader = AutoTrader(mt5_config, risk_config)
    if notify_callback:
        _trader.set_notify(notify_callback)

    logger.info(f"AutoTrader initialised — account {login} on {server}")
    return _trader


def start_scheduler(trader: AutoTrader):
    """Start the APScheduler with all trading jobs."""
    global _scheduler

    if not trader:
        logger.warning("No trader configured — scheduler not started")
        return

    _scheduler = AsyncIOScheduler(timezone="Africa/Johannesburg")

    # 08:00 SAST Mon-Fri — morning briefing
    _scheduler.add_job(
        trader.send_morning_briefing,
        CronTrigger(day_of_week="mon-fri", hour=8, minute=0, timezone="Africa/Johannesburg"),
        id="morning_briefing",
    )

    # Every 15min during market hours — pair scan
    _scheduler.add_job(
        trader.run_scan,
        CronTrigger(
            day_of_week="mon-fri",
            hour="8-17",
            minute="0,15,30,45",
            timezone="Africa/Johannesburg",
        ),
        id="pair_scan",
    )

    # Every 5min during market hours — trailing stop update
    _scheduler.add_job(
        trader.update_trailing_stops,
        CronTrigger(
            day_of_week="mon-fri",
            hour="8-17",
            minute="*/5",
            timezone="Africa/Johannesburg",
        ),
        id="trailing_stops",
    )

    # 17:30 SAST Mon-Fri — daily summary
    _scheduler.add_job(
        trader.send_daily_summary,
        CronTrigger(day_of_week="mon-fri", hour=17, minute=30, timezone="Africa/Johannesburg"),
        id="daily_summary",
    )

    _scheduler.start()
    logger.info("✅ Trading scheduler started (SAST timezone)")