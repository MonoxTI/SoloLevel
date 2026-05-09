"""
Main forex engine — fetches data, runs strategies, applies risk management,
and returns trade setups ready to be placed.
"""
import yfinance as yf
import pandas as pd
from datetime import datetime
from typing import Optional

from app.services.forex.strategies import run_all_strategies, calc_atr
from app.services.forex.risk import (
    RiskConfig, TradeSetup,
    calculate_position_size, calculate_sl_tp, validate_trade,
)

# Forex pairs — yfinance uses =X suffix for forex
FOREX_PAIRS = {
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "USDJPY=X",
    "USDZAR": "USDZAR=X",
    "EURZAR": "EURZAR=X",
    "GBPZAR": "GBPZAR=X",
    "XAUUSD": "GC=F",      # Gold futures as proxy
    "AUDUSD": "AUDUSD=X",
}

DEFAULT_PAIRS = ["EURUSD", "GBPUSD", "USDZAR", "XAUUSD", "USDJPY"]


def fetch_forex_data(symbol: str, period: str = "3mo", interval: str = "1h") -> pd.DataFrame:
    ticker_symbol = FOREX_PAIRS.get(symbol, f"{symbol}=X")
    ticker = yf.Ticker(ticker_symbol)
    df = ticker.history(period=period, interval=interval)
    if df.empty:
        raise ValueError(f"No data for {symbol}")
    return df


def analyse_pair(
    symbol: str,
    account_balance: float = 10000.0,
    open_trades: int = 0,
    daily_pnl_pct: float = 0.0,
    config: RiskConfig = None,
) -> dict:
    """
    Full analysis of a forex pair.
    Returns signal + trade setup if conditions are met.
    """
    if config is None:
        config = RiskConfig()

    try:
        df = fetch_forex_data(symbol)
        analysis = run_all_strategies(df)

        current_price = float(df["Close"].iloc[-1])
        atr_val = float(calc_atr(df).iloc[-1])

        result = {
            "symbol": symbol,
            "price": round(current_price, 5),
            "signal": analysis["final_signal"],
            "confidence": analysis["final_confidence"],
            "score": analysis["score"],
            "strategies": analysis["strategies"],
            "agreeing_strategies": analysis["agreeing"],
            "atr": round(atr_val, 5),
            "trade_setup": None,
            "risk_check": None,
            "analysed_at": datetime.utcnow().isoformat(),
            "error": None,
        }

        # Only build trade setup if there's a real signal
        if analysis["final_signal"] in ("BUY", "SELL"):
            sl, tp = calculate_sl_tp(
                entry_price=current_price,
                direction=analysis["final_signal"],
                symbol=symbol,
                atr=atr_val,
                config=config,
            )

            lot_size = calculate_position_size(
                account_balance=account_balance,
                entry_price=current_price,
                stop_loss=sl,
                symbol=symbol,
                config=config,
            )

            sl_dist = abs(current_price - sl)
            tp_dist = abs(current_price - tp)
            rr = round(tp_dist / sl_dist, 2) if sl_dist > 0 else 0

            risk_amount = account_balance * (config.risk_per_trade_pct / 100)

            setup = TradeSetup(
                symbol=symbol,
                direction=analysis["final_signal"],
                entry_price=current_price,
                stop_loss=sl,
                take_profit=tp,
                lot_size=lot_size,
                risk_amount=round(risk_amount, 2),
                rr_ratio=rr,
                strategy=", ".join(
                    s["strategy"] for s in analysis["strategies"].values()
                    if s["signal"] == analysis["final_signal"]
                ),
                confidence=analysis["final_confidence"],
            )

            approved, reason = validate_trade(setup, open_trades, daily_pnl_pct, config)

            result["trade_setup"] = {
                "direction": setup.direction,
                "entry": setup.entry_price,
                "stop_loss": setup.stop_loss,
                "take_profit": setup.take_profit,
                "lot_size": setup.lot_size,
                "risk_amount": setup.risk_amount,
                "rr_ratio": setup.rr_ratio,
                "strategy": setup.strategy,
            }
            result["risk_check"] = {"approved": approved, "reason": reason}

        return result

    except Exception as e:
        return {
            "symbol": symbol,
            "price": None,
            "signal": "ERROR",
            "confidence": 0,
            "score": 0,
            "strategies": {},
            "agreeing_strategies": 0,
            "atr": None,
            "trade_setup": None,
            "risk_check": None,
            "analysed_at": datetime.utcnow().isoformat(),
            "error": str(e),
        }


def scan_forex(
    pairs: list[str] = None,
    account_balance: float = 10000.0,
    open_trades: int = 0,
    daily_pnl_pct: float = 0.0,
) -> list[dict]:
    """Scan multiple pairs and return sorted by confidence."""
    if pairs is None:
        pairs = DEFAULT_PAIRS
    results = [analyse_pair(p, account_balance, open_trades, daily_pnl_pct) for p in pairs]
    order = {"BUY": 0, "SELL": 1, "HOLD": 2, "ERROR": 3}
    return sorted(results, key=lambda x: (order.get(x["signal"], 3), -x["confidence"]))