import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
import app.models  # noqa: F401
from app.routers import goals, net_worth, transactions, users, daily_goals, finance, trading, forex
from app.services.forex.scheduler import setup_trader, start_scheduler

logger = logging.getLogger(__name__)


async def telegram_notify(message: str):
    """Send a message to Telegram via the Node backend webhook."""
    import os
    node_url = os.getenv("NODE_BACKEND_URL", "http://localhost:3001")
    try:
        async with httpx.AsyncClient() as client:
            await client.post(f"{node_url}/notify", json={"message": message}, timeout=5)
    except Exception as e:
        logger.warning(f"Telegram notify failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables
    await init_db()
    print("✅ Database tables ready")

    # Start MT5 auto trader (only if credentials are set in .env)
    trader = setup_trader(notify_callback=lambda msg: asyncio.create_task(telegram_notify(msg)))
    if trader:
        ok, msg = trader.start()
        if ok:
            start_scheduler(trader)
            print(f"✅ MT5 auto trader started: {msg}")
        else:
            print(f"⚠️  MT5 not connected (paper mode): {msg}")
    else:
        print("ℹ️  MT5 credentials not set — running in paper mode")

    yield

    # Cleanup
    if trader:
        trader.stop()


app = FastAPI(title="Monox Finance API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(transactions.router)
app.include_router(goals.router)
app.include_router(net_worth.router)
app.include_router(daily_goals.router)
app.include_router(finance.router)
app.include_router(trading.router)
app.include_router(forex.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "monox-finance-api"}