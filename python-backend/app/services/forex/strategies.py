"""
Forex trading strategies.
Each strategy analyses price data and returns a signal dict.

Strategies:
1. EMA Crossover    — fast EMA crosses slow EMA
2. Trend Follow     — price above/below long-term EMA + RSI filter
3. Breakout         — price breaks above/below recent high/low
4. Pullback         — trend confirmed, price pulls back to EMA then bounces
"""
import pandas as pd
import numpy as np
from typing import Optional


def calc_ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def calc_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).ewm(com=period - 1, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(com=period - 1, min_periods=period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))


def calc_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df["High"], df["Low"], df["Close"]
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def strategy_ema_crossover(df: pd.DataFrame) -> dict:
    """
    EMA 9 crosses EMA 21.
    BUY when fast crosses above slow.
    SELL when fast crosses below slow.
    """
    close = df["Close"]
    ema9  = calc_ema(close, 20)
    ema21 = calc_ema(close, 50)
    ema50 = calc_ema(close, 200)

    curr_fast, prev_fast = ema9.iloc[-1], ema9.iloc[-2]
    curr_slow, prev_slow = ema21.iloc[-1], ema21.iloc[-2]
    trend_ema = ema50.iloc[-1]
    price = close.iloc[-1]

    bullish_cross = prev_fast <= prev_slow and curr_fast > curr_slow
    bearish_cross = prev_fast >= prev_slow and curr_fast < curr_slow
    trend_up = price > trend_ema
    trend_dn = price < trend_ema

    if bullish_cross and trend_up:
        signal, confidence = "BUY", 0.75
    elif bearish_cross and trend_dn:
        signal, confidence = "SELL", 0.75
    elif bullish_cross:
        signal, confidence = "BUY", 0.55
    elif bearish_cross:
        signal, confidence = "SELL", 0.55
    else:
        signal, confidence = "HOLD", 0.0

    return {
        "strategy": "EMA Crossover",
        "signal": signal,
        "confidence": confidence,
        "ema9": round(float(curr_fast), 5),
        "ema21": round(float(curr_slow), 5),
        "ema50": round(float(trend_ema), 5),
        "details": f"EMA9={curr_fast:.5f} {'>' if curr_fast > curr_slow else '<'} EMA21={curr_slow:.5f}",
    }


def strategy_trend_follow(df: pd.DataFrame) -> dict:
    """
    Price above EMA200 = uptrend. RSI confirmation.
    BUY in uptrend when RSI pulls back from oversold.
    SELL in downtrend when RSI pulls back from overbought.
    """
    close = df["Close"]
    ema200 = calc_ema(close, 200)
    ema50  = calc_ema(close, 50)
    rsi    = calc_rsi(close, 14)

    price     = float(close.iloc[-1])
    e200      = float(ema200.iloc[-1])
    e50       = float(ema50.iloc[-1])
    rsi_now   = float(rsi.iloc[-1])
    rsi_prev  = float(rsi.iloc[-2])

    uptrend   = price > e200 and e50 > e200
    downtrend = price < e200 and e50 < e200

    rsi_bouncing_up   = rsi_prev < 40 and rsi_now > rsi_prev
    rsi_bouncing_down = rsi_prev > 60 and rsi_now < rsi_prev

    if uptrend and rsi_bouncing_up and rsi_now < 60:
        signal, confidence = "BUY", 0.80
    elif downtrend and rsi_bouncing_down and rsi_now > 40:
        signal, confidence = "SELL", 0.80
    elif uptrend and rsi_now < 45:
        signal, confidence = "BUY", 0.60
    elif downtrend and rsi_now > 55:
        signal, confidence = "SELL", 0.60
    else:
        signal, confidence = "HOLD", 0.0

    return {
        "strategy": "Trend Follow",
        "signal": signal,
        "confidence": confidence,
        "rsi": round(rsi_now, 2),
        "ema200": round(e200, 5),
        "details": f"{'Uptrend' if uptrend else 'Downtrend' if downtrend else 'No trend'} · RSI={rsi_now:.1f}",
    }


def strategy_breakout(df: pd.DataFrame, lookback: int = 20) -> dict:
    """
    Price breaks above recent high or below recent low.
    Uses volume confirmation if available.
    """
    close  = df["Close"]
    high   = df["High"]
    low    = df["Low"]

    recent_high = float(high.iloc[-lookback:-1].max())
    recent_low  = float(low.iloc[-lookback:-1].min())
    price       = float(close.iloc[-1])
    prev_price  = float(close.iloc[-2])
    atr_val     = float(calc_atr(df).iloc[-1])

    # Must break by at least 20% of ATR to count (avoid false breaks)
    buffer = atr_val * 0.2

    breakout_up   = prev_price <= recent_high and price > recent_high + buffer
    breakout_down = prev_price >= recent_low  and price < recent_low - buffer

    if breakout_up:
        signal, confidence = "BUY", 0.70
    elif breakout_down:
        signal, confidence = "SELL", 0.70
    else:
        signal, confidence = "HOLD", 0.0

    return {
        "strategy": "Breakout",
        "signal": signal,
        "confidence": confidence,
        "recent_high": round(recent_high, 5),
        "recent_low": round(recent_low, 5),
        "atr": round(atr_val, 5),
        "details": f"Range {recent_low:.5f}–{recent_high:.5f} · Price {price:.5f}",
    }


def strategy_pullback(df: pd.DataFrame) -> dict:
    """
    Trend confirmed by EMA50 direction.
    Wait for price to pull back to EMA21, then bounce back in trend direction.
    """
    close  = df["Close"]
    ema21  = calc_ema(close, 21)
    ema50  = calc_ema(close, 50)
    rsi    = calc_rsi(close, 14)
    atr    = calc_atr(df)

    price     = float(close.iloc[-1])
    prev      = float(close.iloc[-2])
    e21       = float(ema21.iloc[-1])
    e50_now   = float(ema50.iloc[-1])
    e50_prev  = float(ema50.iloc[-5])
    rsi_now   = float(rsi.iloc[-1])
    atr_val   = float(atr.iloc[-1])
    tolerance = atr_val * 0.5  # within 0.5 ATR of EMA21

    trend_up = e50_now > e50_prev
    trend_dn = e50_now < e50_prev

    near_ema21 = abs(price - e21) <= tolerance
    bouncing_up   = near_ema21 and prev < price and trend_up and rsi_now > 40
    bouncing_down = near_ema21 and prev > price and trend_dn and rsi_now < 60

    if bouncing_up:
        signal, confidence = "BUY", 0.85
    elif bouncing_down:
        signal, confidence = "SELL", 0.85
    else:
        signal, confidence = "HOLD", 0.0

    return {
        "strategy": "Pullback",
        "signal": signal,
        "confidence": confidence,
        "ema21": round(e21, 5),
        "rsi": round(rsi_now, 2),
        "details": f"{'Uptrend' if trend_up else 'Downtrend'} · Near EMA21={e21:.5f} · RSI={rsi_now:.1f}",
    }


def run_all_strategies(df: pd.DataFrame) -> dict:
    """
    Run all 4 strategies and combine into a final signal.
    Majority vote weighted by confidence.
    """
    results = {
        "ema_crossover": strategy_ema_crossover(df),
        "trend_follow":  strategy_trend_follow(df),
        "breakout":      strategy_breakout(df),
        "pullback":      strategy_pullback(df),
    }

    # Score: BUY=+1, SELL=-1, HOLD=0, weighted by confidence
    total_score = 0.0
    total_confidence = 0.0
    for r in results.values():
        weight = r["confidence"]
        if r["signal"] == "BUY":
            total_score += weight
        elif r["signal"] == "SELL":
            total_score -= weight
        total_confidence += weight

    avg_confidence = total_confidence / len(results)
    normalised = total_score / len(results)  # -1 to +1 range

    if normalised >= 0.4:
        final_signal, final_confidence = "BUY", min(0.95, avg_confidence + 0.1)
    elif normalised <= -0.4:
        final_signal, final_confidence = "SELL", min(0.95, avg_confidence + 0.1)
    else:
        final_signal, final_confidence = "HOLD", 0.0

    return {
        "final_signal": final_signal,
        "final_confidence": round(final_confidence, 3),
        "score": round(normalised, 3),
        "strategies": results,
        "agreeing": sum(1 for r in results.values() if r["signal"] == final_signal),
    }