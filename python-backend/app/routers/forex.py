from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from app.services.forex.v2.engine import analyse_pair_v2, scan_forex_v2, DEFAULT_PAIRS, FOREX_PAIRS
from app.services.forex.v2.risk import RiskConfig
from app.services.forex.v2.backtest import run_backtest
from app.services.forex.v2.performance import get_tracker
from app.services.forex.scheduler import get_trader

router = APIRouter(prefix="/forex", tags=["forex"])


# ── Schemas ───────────────────────────────────────────────────────────────────

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
    engine: Optional[str] = "v2"


class ScanRequest(BaseModel):
    pairs: Optional[list[str]] = None
    account_balance: float = 10000.0
    open_trades: int = 0
    daily_pnl_pct: float = 0.0
    risk_per_trade_pct: float = 1.0
    max_open_trades: int = 5


# ── Signal endpoints ──────────────────────────────────────────────────────────

@router.get("/pairs")
async def get_pairs():
    return {"pairs": list(FOREX_PAIRS.keys()), "default": DEFAULT_PAIRS}


@router.get("/analyse/{symbol}", response_model=ForexSignalOut)
async def analyse_symbol(
    symbol: str,
    account_balance: float = Query(default=10000.0),
    open_trades: int = Query(default=0),
    daily_pnl_pct: float = Query(default=0.0),
    risk_pct: float = Query(default=1.0),
):
    config = RiskConfig(risk_per_trade_pct=risk_pct)
    return analyse_pair_v2(symbol.upper(), account_balance, open_trades, daily_pnl_pct, config)


@router.get("/scan", response_model=list[ForexSignalOut])
async def scan_default(
    account_balance: float = Query(default=10000.0),
    open_trades: int = Query(default=0),
):
    return scan_forex_v2(pairs=DEFAULT_PAIRS, account_balance=account_balance, open_trades=open_trades)


@router.post("/scan", response_model=list[ForexSignalOut])
async def scan_pairs(body: ScanRequest):
    config = RiskConfig(
        risk_per_trade_pct=body.risk_per_trade_pct,
        max_open_trades=body.max_open_trades,
    )
    return scan_forex_v2(
        pairs=body.pairs or DEFAULT_PAIRS,
        account_balance=body.account_balance,
        open_trades=body.open_trades,
        daily_pnl_pct=body.daily_pnl_pct,
        config=config,
    )


# ── Backtest endpoints ────────────────────────────────────────────────────────

@router.get("/backtest/{symbol}")
async def backtest_symbol(
    symbol: str,
    period: str = Query(default="6mo", description="e.g. 3mo, 6mo, 1y"),
    initial_balance: float = Query(default=10000.0),
    risk_pct: float = Query(default=1.0),
):
    """
    Run a historical backtest for a symbol.
    Takes ~10–30s depending on data size.
    """
    config = RiskConfig(risk_per_trade_pct=risk_pct)
    result = run_backtest(symbol.upper(), period=period, initial_balance=initial_balance, config=config)
    if "error" in result and len(result) == 2:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


# ── Performance endpoints ─────────────────────────────────────────────────────

@router.get("/performance")
async def get_performance():
    """Per-strategy win rates and dynamic weights."""
    tracker = get_tracker()
    return {"strategies": tracker.get_summary()}


@router.post("/performance/record")
async def record_trade_outcome(strategy: str, pnl: float):
    """Manually record a trade outcome (used by auto-trader after close)."""
    tracker = get_tracker()
    tracker.record_trade(strategy, pnl)
    return {"recorded": True, "strategy": strategy, "pnl": pnl}


@router.delete("/performance/reset")
async def reset_performance():
    """Reset all strategy performance stats (use carefully)."""
    get_tracker().reset()
    return {"reset": True}


# ── MT5 live trading endpoints ────────────────────────────────────────────────

@router.get("/mt5/status")
async def mt5_status():
    trader = get_trader()
    if not trader:
        return {"connected": False, "reason": "MT5 credentials not configured in .env"}
    if not trader.client.connected:
        ok, msg = trader.start()
        if not ok:
            return {"connected": False, "reason": msg}
    return {"connected": True, "account": trader.client.get_account_info()}


@router.get("/mt5/positions")
async def mt5_positions():
    trader = get_trader()
    if not trader or not trader.client.connected:
        return {"positions": [], "error": "MT5 not connected"}
    positions = trader.client.get_open_positions()
    return {
        "positions": [
            {
                "ticket":     p.ticket,
                "symbol":     p.symbol,
                "direction":  p.direction,
                "volume":     p.volume,
                "open_price": p.open_price,
                "sl":         p.sl,
                "tp":         p.tp,
                "profit":     p.profit,
                "open_time":  p.open_time.isoformat(),
            }
            for p in positions
        ]
    }


@router.post("/mt5/scan")
async def mt5_manual_scan():
    trader = get_trader()
    if not trader:
        raise HTTPException(status_code=503, detail="MT5 not configured")
    if not trader.client.connected:
        ok, msg = trader.start()
        if not ok:
            raise HTTPException(status_code=503, detail=f"MT5 not connected: {msg}")
    results = trader.run_scan()
    return {"trades_placed": len(results), "results": results}


@router.post("/mt5/close/{ticket}")
async def mt5_close_position(ticket: int):
    trader = get_trader()
    if not trader or not trader.client.connected:
        raise HTTPException(status_code=503, detail="MT5 not connected")
    ok, msg = trader.client.close_position(ticket)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"closed": True, "message": msg}


@router.get("/mt5/summary")
async def mt5_summary():
    trader = get_trader()
    if not trader or not trader.client.connected:
        return {"connected": False}
    account   = trader.client.get_account_info()
    positions = trader.client.get_open_positions()
    total_pnl = sum(p.profit for p in positions)
    return {
        "connected":    True,
        "balance":      account.get("balance", 0),
        "equity":       account.get("equity", 0),
        "profit":       account.get("profit", 0),
        "total_pnl":    total_pnl,
        "open_trades":  len(positions),
        "currency":     account.get("currency", "ZAR"),
        "trades_today": trader.daily_trades,
    }