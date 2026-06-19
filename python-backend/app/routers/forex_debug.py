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


@router.post("/force-trade/{symbol}")
async def force_trade(symbol: str):
    """
    Step through _evaluate_pair for one symbol and return every decision point.
    Shows exactly where the trade attempt dies.
    """
    from app.services.forex.v2.engine import analyse_pair_v2
    from app.services.forex.v2.risk import validate_trade, calculate_sl_tp, calculate_position_size

    trader = get_trader()
    if not trader:
        return {"error": "Trader not initialised"}

    sym = symbol.upper()
    steps = []

    # Step 1: account info
    account = trader.client.get_account_info()
    steps.append({"step": "account", "result": account})
    if "error" in account:
        return {"failed_at": "account", "steps": steps}

    balance = account["balance"]

    # Step 2: existing positions
    existing = trader.client.get_open_positions()
    already_open = [p.symbol for p in existing]
    steps.append({"step": "existing_positions", "result": already_open})
    if sym in already_open:
        return {"failed_at": "already_open", "steps": steps}

    # Step 3: analyse
    analysis = analyse_pair_v2(sym, balance, len(existing), 0.0, trader.risk)
    steps.append({"step": "analysis", "result": {
        "signal":       analysis.get("signal"),
        "confidence":   analysis.get("confidence"),
        "score":        analysis.get("score"),
        "agreeing":     analysis.get("agreeing_strategies"),
        "trade_setup":  analysis.get("trade_setup"),
        "risk_check":   analysis.get("risk_check"),
        "error":        analysis.get("error"),
    }})
    if analysis.get("error"):
        return {"failed_at": "analysis_error", "steps": steps}
    if analysis.get("signal") not in ("BUY", "SELL"):
        return {"failed_at": "signal_is_hold", "steps": steps}
    if not analysis.get("trade_setup"):
        return {"failed_at": "no_trade_setup", "steps": steps}
    if not analysis.get("risk_check"):
        return {"failed_at": "no_risk_check", "steps": steps}
    if not analysis["risk_check"]["approved"]:
        return {"failed_at": f"risk_rejected: {analysis['risk_check']['reason']}", "steps": steps}

    # Step 4: live price
    price_info = trader.client.get_price(sym)
    steps.append({"step": "live_price", "result": price_info})
    if not price_info:
        return {"failed_at": "no_live_price", "steps": steps}

    signal    = analysis["signal"]
    atr_val   = analysis.get("atr") or 0.001
    live_price = price_info["ask"] if signal == "BUY" else price_info["bid"]

    sl, tp = calculate_sl_tp(
        entry_price=live_price,
        direction=signal,
        symbol=sym,
        atr_val=atr_val,
        config=trader.risk,
    )
    lot_size = calculate_position_size(
        account_balance=balance,
        entry_price=live_price,
        stop_loss=sl,
        symbol=sym,
        config=trader.risk,
    )
    steps.append({"step": "sizing", "result": {
        "entry": live_price, "sl": sl, "tp": tp, "lots": lot_size, "atr": atr_val
    }})

    # Step 5: place order
    ok, result = trader.client.place_order(
        symbol=sym,
        direction=signal,
        lot_size=lot_size,
        stop_loss=sl,
        take_profit=tp,
        comment=f"MonoxBot·DEBUG·{signal}",
    )
    steps.append({"step": "place_order", "ok": ok, "result": result})

    return {
        "failed_at": None if ok else f"place_order_failed: {result}",
        "trade_placed": ok,
        "steps": steps,
    }