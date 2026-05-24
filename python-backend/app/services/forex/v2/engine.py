"""
Forex v2 main engine.

Orchestrates: data fetching → multi-timeframe strategy run →
weighted aggregation → risk sizing → result.

Router and auto-trader both call this instead of the v1 engine.
"""
import logging
from datetime import datetime
from typing import Optional

from .data import fetch_all_timeframes, DEFAULT_PAIRS, FOREX_PAIRS
from .strategies import run_all_strategies
from .risk import RiskConfig, build_trade_setup, validate_trade
from .indicators import atr
from .performance import get_tracker

logger = logging.getLogger(__name__)


def analyse_pair_v2(
    symbol: str,
    account_balance: float = 10000.0,
    open_trades: int = 0,
    daily_pnl_pct: float = 0.0,
    config: RiskConfig = None,
) -> dict:
    """
    Full multi-timeframe analysis of a forex pair.
    Returns a result dict compatible with the v1 ForexSignalOut schema
    plus extra v2 fields (timeframe_data, strategy_details).
    """
    if config is None:
        config = RiskConfig()

    base = {
        "symbol": symbol,
        "price": None,
        "signal": "ERROR",
        "confidence": 0.0,
        "score": 0.0,
        "strategies": {},
        "agreeing_strategies": 0,
        "atr": None,
        "trade_setup": None,
        "risk_check": None,
        "analysed_at": datetime.utcnow().isoformat(),
        "error": None,
        "engine": "v2",
    }

    try:
        # 1. Fetch multi-timeframe data
        dfs = fetch_all_timeframes(symbol)
        df1h = dfs["1h"]

        current_price = float(df1h["Close"].iloc[-1])
        atr_val       = float(atr(df1h, 14).iloc[-1])

        # 2. Get dynamic weights from performance tracker
        tracker = get_tracker()
        weights = tracker.get_weights()

        # 3. Run all strategies with weighted aggregation
        analysis = run_all_strategies(dfs, weights=weights)

        base.update({
            "price": round(current_price, 5),
            "signal": analysis["final_signal"],
            "confidence": analysis["final_confidence"],
            "score": analysis["score"],
            "strategies": analysis["strategies"],
            "agreeing_strategies": analysis["agreeing"],
            "atr": round(atr_val, 5),
            "error": None,
        })

        # 4. Build trade setup if there's a real signal
        if analysis["final_signal"] in ("BUY", "SELL"):
            # Which strategies agreed?
            agreeing_names = [
                name for name, s in analysis["strategies"].items()
                if s["signal"] == analysis["final_signal"]
            ]

            setup = build_trade_setup(
                symbol=symbol,
                direction=analysis["final_signal"],
                entry_price=current_price,
                atr_val=atr_val,
                confidence=analysis["final_confidence"],
                strategy_name=", ".join(agreeing_names),
                account_balance=account_balance,
                config=config,
            )

            approved, reason = validate_trade(setup, open_trades, daily_pnl_pct, config)

            base["trade_setup"] = {
                "direction":   setup.direction,
                "entry":       setup.entry_price,
                "stop_loss":   setup.stop_loss,
                "take_profit": setup.take_profit,
                "lot_size":    setup.lot_size,
                "risk_amount": setup.risk_amount,
                "rr_ratio":    setup.rr_ratio,
                "strategy":    setup.strategy,
                "atr":         setup.atr,
            }
            base["risk_check"] = {"approved": approved, "reason": reason}

        return base

    except Exception as e:
        logger.error(f"v2 engine error for {symbol}: {e}", exc_info=True)
        base["error"] = str(e)
        base["signal"] = "ERROR"
        return base


def scan_forex_v2(
    pairs: list[str] = None,
    account_balance: float = 10000.0,
    open_trades: int = 0,
    daily_pnl_pct: float = 0.0,
    config: RiskConfig = None,
) -> list[dict]:
    """
    Scan multiple pairs. Returns results sorted by signal quality.
    Falls back gracefully per-pair — one error won't block others.
    """
    if pairs is None:
        pairs = DEFAULT_PAIRS

    results = [
        analyse_pair_v2(p, account_balance, open_trades, daily_pnl_pct, config)
        for p in pairs
    ]

    order = {"BUY": 0, "SELL": 1, "HOLD": 2, "ERROR": 3}
    return sorted(results, key=lambda x: (order.get(x["signal"], 3), -x["confidence"]))