from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.forex.engine import analyse_pair, scan_forex, DEFAULT_PAIRS, FOREX_PAIRS
from app.services.forex.risk import RiskConfig

router = APIRouter(prefix="/forex", tags=["forex"])


class ForexSignalOut(BaseModel):
    symbol: str
    price: Optional[float]
    signal: str
    confidence: float
    score: float
    agreeing_strategies: int
    atr: Optional[float]
    trade_setup: Optional[dict]
    risk_check: Optional[dict]
    strategies: dict
    analysed_at: str
    error: Optional[str]


class ScanRequest(BaseModel):
    pairs: Optional[list[str]] = None
    account_balance: float = 10000.0
    open_trades: int = 0
    daily_pnl_pct: float = 0.0
    risk_per_trade_pct: float = 1.0
    max_open_trades: int = 5


@router.get("/pairs")
async def get_pairs():
    """Return all supported forex pairs."""
    return {"pairs": list(FOREX_PAIRS.keys()), "default": DEFAULT_PAIRS}


@router.get("/analyse/{symbol}", response_model=ForexSignalOut)
async def analyse_symbol(
    symbol: str,
    account_balance: float = Query(default=10000.0),
    open_trades: int = Query(default=0),
    daily_pnl_pct: float = Query(default=0.0),
    risk_pct: float = Query(default=1.0),
):
    """Full analysis of a single forex pair with trade setup."""
    config = RiskConfig(risk_per_trade_pct=risk_pct)
    return analyse_pair(symbol.upper(), account_balance, open_trades, daily_pnl_pct, config)


@router.post("/scan", response_model=list[ForexSignalOut])
async def scan_pairs(body: ScanRequest):
    """Scan multiple pairs — returns trade setups sorted by confidence."""
    config = RiskConfig(
        risk_per_trade_pct=body.risk_per_trade_pct,
        max_open_trades=body.max_open_trades,
    )
    return scan_forex(
        pairs=body.pairs or DEFAULT_PAIRS,
        account_balance=body.account_balance,
        open_trades=body.open_trades,
        daily_pnl_pct=body.daily_pnl_pct,
    )


@router.get("/scan", response_model=list[ForexSignalOut])
async def scan_default(
    account_balance: float = Query(default=10000.0),
    open_trades: int = Query(default=0),
):
    """Quick scan with default settings — used by dashboard."""
    return scan_forex(
        pairs=DEFAULT_PAIRS,
        account_balance=account_balance,
        open_trades=open_trades,
    )