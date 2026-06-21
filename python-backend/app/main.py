import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
import app.models  # noqa: F401
from app.routers import goals, net_worth, transactions, users, daily_goals, finance, trading, insights
from app.routers import notes_todos
from app.services.ml.scheduler import add_ml_jobs
from app.services.miss_scheduler import add_miss_penalty_job

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print("✅ Database tables ready")

    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    scheduler = AsyncIOScheduler(timezone="Africa/Johannesburg")
    add_ml_jobs(scheduler)
    add_miss_penalty_job(scheduler)
    scheduler.start()
    print("✅ ML + miss-penalty schedulers running")

    yield

    scheduler.shutdown()


app = FastAPI(title="Monox Finance API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", 
                   "http://192.168.10.148:3000"],
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
app.include_router(insights.router)
app.include_router(notes_todos.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "monox-finance-api"}