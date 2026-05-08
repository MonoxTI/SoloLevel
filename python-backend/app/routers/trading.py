from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.trading import analyse_signal, scan_watchlist, DEFAULT_WATCHLIST

router = APIRouter(prefix="/trading", tags=["trading"])


class SignalOut(BaseModel):
    symbol: str
    price: Optional[float]
    rsi: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_histogram: Optional[float] = None
    upper_bb: Optional[float] = None
    lower_bb: Optional[float] = None
    score: int = 0
    signals: list[str] = []
    recommendation: str
    analysed_at: str
    error: Optional[str] = None


@router.get("/signal/{symbol}", response_model=SignalOut)
async def get_signal(symbol: str):
    """Get trading signal for a single JSE stock."""
    result = analyse_signal(symbol.upper())
    return result


@router.get("/scan", response_model=list[SignalOut])
async def scan_market(
    symbols: Optional[str] = Query(
        default=None,
        description="Comma-separated symbols e.g. NPN.JO,MTN.JO — defaults to full watchlist"
    )
):
    """Scan multiple stocks and return signals sorted by strength."""
    symbol_list = [s.strip().upper() for s in symbols.split(",")] if symbols else DEFAULT_WATCHLIST
    return scan_watchlist(symbol_list)


@router.get("/watchlist")
async def get_watchlist():
    """Return the default JSE watchlist."""
    return {"symbols": DEFAULT_WATCHLIST}