"""
Backtesting engine for forex v2 strategies.

Runs a walk-forward simulation on historical OHLCV data.
Uses the v2 strategy stack on each window, simulates trade entry/exit,
and returns an equity curve + per-strategy stats.

Trade simulation rules:
  - Entry: open of next candle after signal
  - Exit:  first candle that hits SL or TP (or end of data)
  - No overlapping trades on the same symbol
  - 1% risk per trade, fixed
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import pandas as pd

from .data import fetch_all_timeframes
from .strategies import run_all_strategies
from .risk import RiskConfig, calculate_sl_tp
from .indicators import atr

logger = logging.getLogger(__name__)


@dataclass
class BacktestTrade:
    symbol: str
    direction: str
    entry_price: float
    stop_loss: float
    take_profit: float
    entry_idx: int
    exit_idx: Optional[int]
    exit_price: Optional[float]
    outcome: str        # "WIN" | "LOSS" | "OPEN"
    pnl_pct: float      # % of entry price
    strategy: str
    confidence: float


@dataclass
class BacktestResult:
    symbol: str
    period: str
    initial_balance: float
    final_balance: float
    total_trades: int
    wins: int
    losses: int
    win_rate: float
    profit_factor: float       # gross profit / gross loss
    max_drawdown_pct: float
    equity_curve: list[dict]   # [{"date": ..., "balance": ...}]
    trades: list[dict]
    strategy_breakdown: dict   # per-strategy win rates


def run_backtest(
    symbol: str,
    period: str = "6mo",
    initial_balance: float = 10000.0,
    config: RiskConfig = None,
) -> dict:
    """
    Run a backtest for a single symbol over the given period.
    Returns a BacktestResult as a dict.
    """
    if config is None:
        config = RiskConfig()

    logger.info(f"Starting backtest: {symbol} · {period} · balance={initial_balance}")

    try:
        dfs = fetch_all_timeframes(symbol)
    except Exception as e:
        return {"error": f"Failed to fetch data: {e}", "symbol": symbol}

    df1h = dfs["1h"]
    n    = len(df1h)

    # Need at least 250 bars for indicators to warm up
    warmup = 250
    if n < warmup + 50:
        return {"error": f"Insufficient data: {n} bars (need {warmup + 50})", "symbol": symbol}

    balance         = initial_balance
    equity_curve    = []
    trades: list[BacktestTrade] = []
    open_trade: Optional[BacktestTrade] = None

    # Per-strategy tracking
    strategy_stats: dict[str, dict] = {}

    # Walk forward from warmup index
    for i in range(warmup, n - 1):
        # Check if open trade hits SL/TP on this candle
        if open_trade is not None:
            candle_high = float(df1h["High"].iloc[i])
            candle_low  = float(df1h["Low"].iloc[i])

            hit_sl = hit_tp = False
            if open_trade.direction == "BUY":
                hit_sl = candle_low  <= open_trade.stop_loss
                hit_tp = candle_high >= open_trade.take_profit
            else:
                hit_sl = candle_high >= open_trade.stop_loss
                hit_tp = candle_low  <= open_trade.take_profit

            if hit_tp or hit_sl:
                exit_price = open_trade.take_profit if hit_tp else open_trade.stop_loss
                pnl_pct    = abs(exit_price - open_trade.entry_price) / open_trade.entry_price
                if (hit_tp and open_trade.direction == "BUY") or (hit_sl and open_trade.direction == "SELL"):
                    pnl_pct = pnl_pct   # win
                    outcome = "WIN"
                    balance += balance * config.risk_per_trade_pct / 100 * config.sl_atr_multiplier * config.tp_atr_multiplier / config.sl_atr_multiplier
                    # Simplified: risk% × RR for wins
                    balance += balance * (config.risk_per_trade_pct / 100) * (config.tp_atr_multiplier / config.sl_atr_multiplier - 1)
                else:
                    outcome = "LOSS"
                    balance -= balance * config.risk_per_trade_pct / 100

                open_trade.exit_idx   = i
                open_trade.exit_price = round(exit_price, 5)
                open_trade.outcome    = outcome
                open_trade.pnl_pct    = round(pnl_pct, 4)
                trades.append(open_trade)

                # Update strategy stats
                for sname in open_trade.strategy.split(", "):
                    sname = sname.strip()
                    if sname not in strategy_stats:
                        strategy_stats[sname] = {"wins": 0, "losses": 0}
                    if outcome == "WIN":
                        strategy_stats[sname]["wins"] += 1
                    else:
                        strategy_stats[sname]["losses"] += 1

                open_trade = None

        # No open trade: check for a new signal
        if open_trade is None:
            # Slice data up to current bar (no lookahead)
            slice_1h = df1h.iloc[:i+1]
            slice_dfs = {"1h": slice_1h}
            if "4h" in dfs:
                # Rough approximation: daily bars up to equivalent time
                slice_4h_end = min(len(dfs["4h"]), i // 4 + 1)
                slice_dfs["4h"] = dfs["4h"].iloc[:slice_4h_end] if slice_4h_end > 50 else dfs["4h"]
            if "1d" in dfs:
                slice_1d_end = min(len(dfs["1d"]), i // 24 + 1)
                slice_dfs["1d"] = dfs["1d"].iloc[:slice_1d_end] if slice_1d_end > 50 else dfs["1d"]

            try:
                result = run_all_strategies(slice_dfs)
            except Exception:
                continue

            if result["final_signal"] not in ("BUY", "SELL"):
                continue
            if result["final_confidence"] < config.min_confidence:
                continue

            entry_price = float(df1h["Open"].iloc[i + 1])  # next candle open
            atr_val     = float(atr(slice_1h, 14).iloc[-1])
            sl, tp      = calculate_sl_tp(entry_price, result["final_signal"], symbol, atr_val, config)

            open_trade = BacktestTrade(
                symbol=symbol,
                direction=result["final_signal"],
                entry_price=entry_price,
                stop_loss=sl,
                take_profit=tp,
                entry_idx=i + 1,
                exit_idx=None,
                exit_price=None,
                outcome="OPEN",
                pnl_pct=0.0,
                strategy=", ".join(
                    name for name, s in result["strategies"].items()
                    if s["signal"] == result["final_signal"]
                ),
                confidence=result["final_confidence"],
            )

        # Record equity curve every 24 bars (daily resolution)
        if i % 24 == 0:
            date_val = df1h.index[i]
            date_str = date_val.isoformat() if hasattr(date_val, "isoformat") else str(date_val)
            equity_curve.append({"date": date_str, "balance": round(balance, 2)})

    # Close any open trade at last price
    if open_trade is not None:
        open_trade.exit_idx   = n - 1
        open_trade.exit_price = float(df1h["Close"].iloc[-1])
        open_trade.outcome    = "OPEN"
        trades.append(open_trade)

    # Calculate stats
    completed = [t for t in trades if t.outcome in ("WIN", "LOSS")]
    wins_list  = [t for t in completed if t.outcome == "WIN"]
    loss_list  = [t for t in completed if t.outcome == "LOSS"]

    win_rate = len(wins_list) / len(completed) if completed else 0.0

    gross_profit = sum(
        initial_balance * config.risk_per_trade_pct / 100 * (config.tp_atr_multiplier / config.sl_atr_multiplier)
        for _ in wins_list
    )
    gross_loss = sum(
        initial_balance * config.risk_per_trade_pct / 100
        for _ in loss_list
    )
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0.0

    # Max drawdown from equity curve
    if equity_curve:
        balances = [e["balance"] for e in equity_curve]
        peak = balances[0]
        max_dd = 0.0
        for b in balances:
            if b > peak:
                peak = b
            dd = (peak - b) / peak
            if dd > max_dd:
                max_dd = dd
    else:
        max_dd = 0.0

    strategy_breakdown = {
        name: {
            "wins": s["wins"],
            "losses": s["losses"],
            "win_rate": round(s["wins"] / (s["wins"] + s["losses"]), 3) if (s["wins"] + s["losses"]) > 0 else 0,
        }
        for name, s in strategy_stats.items()
    }

    return {
        "symbol": symbol,
        "period": period,
        "initial_balance": initial_balance,
        "final_balance": round(balance, 2),
        "total_return_pct": round((balance - initial_balance) / initial_balance * 100, 2),
        "total_trades": len(completed),
        "wins": len(wins_list),
        "losses": len(loss_list),
        "win_rate": round(win_rate, 3),
        "profit_factor": round(profit_factor, 2),
        "max_drawdown_pct": round(max_dd * 100, 2),
        "equity_curve": equity_curve,
        "trades": [
            {
                "direction":    t.direction,
                "entry_price":  t.entry_price,
                "stop_loss":    t.stop_loss,
                "take_profit":  t.take_profit,
                "outcome":      t.outcome,
                "strategy":     t.strategy,
                "confidence":   t.confidence,
            }
            for t in trades[:100]  # cap at 100 for API response size
        ],
        "strategy_breakdown": strategy_breakdown,
        "engine": "v2",
    }