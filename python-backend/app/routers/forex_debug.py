"""
Debug router — shows exactly what the engine sees for each pair.
Fully self-contained, no dependency on v2.indicators directly.
"""
from fastapi import APIRouter
from app.services.forex.v2.data import fetch_all_timeframes, DEFAULT_PAIRS
from app.services.forex.v2.strategies import (
    strategy_ema_crossover, strategy_trend_follow,
    strategy_breakout, strategy_pullback_macd,
    _atr, _rsi,
)
from app.services.forex.scheduler import get_trader

router = APIRouter(prefix="/forex/debug", tags=["forex-debug"])


@router.get("/diagnose/{symbol}")
async def diagnose(symbol: str):
    """Full per-strategy breakdown for one pair with blocked_reason."""
    try:
        dfs = fetch_all_timeframes(symbol.upper())
        df1h = dfs["1h"]

        atr_val = float(_atr(df1h, 14).iloc[-1])
        rsi_val = float(_rsi(df1h["Close"], 14).iloc[-1])
        price   = float(df1h["Close"].iloc[-1])

        strats = {
            "EMA Crossover":   strategy_ema_crossover(dfs),
            "Trend Follow":    strategy_trend_follow(dfs),
            "Breakout":        strategy_breakout(dfs),
            "Pullback + MACD": strategy_pullback_macd(dfs),
        }

        signals = {
            name: {"signal": r.signal, "confidence": r.confidence, "details": r.details}
            for name, r in strats.items()
        }

        buy_count  = sum(1 for r in strats.values() if r.signal == "BUY")
        sell_count = sum(1 for r in strats.values() if r.signal == "SELL")

        total_score = 0.0
        for r in strats.values():
            if r.signal == "BUY":    total_score += r.confidence
            elif r.signal == "SELL": total_score -= r.confidence
        normalised = total_score / len(strats)  # matches aggregator logic

        verdict = "HOLD"
        if normalised >= 0.15:
            verdict = "BUY"
        elif normalised <= -0.15:
            verdict = "SELL"

        blocked = ""
        if verdict == "HOLD":
            parts = []
            if abs(normalised) < 0.40:
                parts.append(f"score={normalised:.3f} below ±0.15 threshold")
            if buy_count == 0 and sell_count == 0:
                parts.append("no strategy fired")
            blocked = "; ".join(parts) or "mixed signals"

        return {
            "symbol":         symbol.upper(),
            "price":          price,
            "atr":            round(atr_val, 5),
            "rsi_1h":         round(rsi_val, 2),
            "strategies":     signals,
            "buy_count":      buy_count,
            "sell_count":     sell_count,
            "score":          round(normalised, 3),
            "verdict":        verdict,
            "blocked_reason": blocked,
            "bars_1h":        len(df1h),
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc(), "symbol": symbol}


@router.get("/scan-verbose")
async def scan_verbose():
    """Diagnose all default pairs at once."""
    results = []
    for pair in DEFAULT_PAIRS:
        results.append(await diagnose(pair))
    return results


@router.get("/trader-state")
async def trader_state():
    """Show live auto trader state."""
    trader = get_trader()
    if not trader:
        return {"error": "Trader not initialised"}
    return {
        "connected":    trader.client.connected,
        "daily_trades": trader.daily_trades,
        "daily_pnl":    trader.daily_pnl,
        "trade_log":    trader.trade_log[-10:],
        "risk": {
            "risk_per_trade_pct": trader.risk.risk_per_trade_pct,
            "min_confidence":     trader.risk.min_confidence,
            "max_open_trades":    trader.risk.max_open_trades,
            "max_daily_loss_pct": trader.risk.max_daily_loss_pct,
            "min_rr_ratio":       trader.risk.min_rr_ratio,
        },
    }