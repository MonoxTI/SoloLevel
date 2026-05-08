from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
import app.models  # noqa: F401

from app.routers import goals, net_worth, transactions, users, daily_goals, finance, trading


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print("✅ Database tables ready")
    yield


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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "monox-finance-api"}