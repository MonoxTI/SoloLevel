"""
Forex v2 strategies — v1 conditions adapted to the v2 multi-timeframe interface.

Each strategy receives dfs: dict[str, pd.DataFrame] (keys: "1h", "4h", "1d")
and returns a StrategyResult. The v1 logic is preserved exactly because it was
proven to fire — the only change is accepting multi-timeframe data and returning
a StrategyResult instead of a plain dict.

Strategies:
  1. EMA Crossover  — EMA20/50/200 crossover with trend filter
  2. Trend Follow   — EMA200 trend + RSI pullback entry
  3. Breakout       — price breaks 20-bar high/low with ATR buffer
  4. Pullback       — EMA50 trend + bounce off EMA21 with RSI confirm
"""
from dataclasses import dataclass, field
import pandas as pd
import numpy as np


@dataclass
class StrategyResult:
    strategy: str
    signal: str           # BUY | SELL | HOLD
    confidence: float     # 0.0 – 1.0
    timeframe: str
    details: str
    indicators: dict = field(default_factory=dict)


# ── Shared indicator helpers ──────────────────────────────────────────────────

def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()

def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).ewm(com=period - 1, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(com=period - 1, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - (100 / (1 + rs))).fillna(50)

def _atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df["High"], df["Low"], df["Close"]
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()

def _last(s: pd.Series) -> float:
    return float(s.iloc[-1])

def _prev(s: pd.Series, n: int = 1) -> float:
    return float(s.iloc[-(n + 1)])


# ── Strategy 1: EMA Crossover ─────────────────────────────────────────────────

def strategy_ema_crossover(dfs: dict) -> StrategyResult:
    """EMA20 crosses EMA50, filtered by EMA200 trend. Uses 1h data."""
    df = dfs.get("1h") if "1h" in dfs else next(iter(dfs.values()))
    close = df["Close"]

    ema20  = _ema(close, 20)
    ema50  = _ema(close, 50)
    ema200 = _ema(close, 200)

    curr_fast, prev_fast = _last(ema20), _prev(ema20)
    curr_slow, prev_slow = _last(ema50), _prev(ema50)
    trend_ema = _last(ema200)
    price = _last(close)

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

    return StrategyResult(
        strategy="EMA Crossover",
        signal=signal,
        confidence=confidence,
        timeframe="1h",
        details=f"EMA20={curr_fast:.5f} {'>' if curr_fast > curr_slow else '<'} EMA50={curr_slow:.5f} · trend={'up' if trend_up else 'dn'}",
        indicators={"ema20": round(curr_fast, 5), "ema50": round(curr_slow, 5),
                    "ema200": round(trend_ema, 5), "bullish_cross": bullish_cross},
    )


# ── Strategy 2: Trend Follow ──────────────────────────────────────────────────

def strategy_trend_follow(dfs: dict) -> StrategyResult:
    """EMA200 + EMA50 define trend. RSI pullback entry. Uses 1h data."""
    df = dfs.get("1h") if "1h" in dfs else next(iter(dfs.values()))
    close = df["Close"]

    ema200 = _ema(close, 200)
    ema50  = _ema(close, 50)
    rsi    = _rsi(close, 14)

    price    = _last(close)
    e200     = _last(ema200)
    e50      = _last(ema50)
    rsi_now  = _last(rsi)
    rsi_prev = _prev(rsi)

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

    return StrategyResult(
        strategy="Trend Follow",
        signal=signal,
        confidence=confidence,
        timeframe="1h",
        details=f"{'Uptrend' if uptrend else 'Downtrend' if downtrend else 'No trend'} · RSI={rsi_now:.1f}",
        indicators={"rsi": round(rsi_now, 2), "ema200": round(e200, 5),
                    "uptrend": uptrend, "downtrend": downtrend},
    )


# ── Strategy 3: Breakout ──────────────────────────────────────────────────────

def strategy_breakout(dfs: dict, lookback: int = 20) -> StrategyResult:
    """Price breaks 20-bar high/low with ATR buffer. Uses 1h data."""
    df = dfs.get("1h") if "1h" in dfs else next(iter(dfs.values()))
    close, high, low = df["Close"], df["High"], df["Low"]

    recent_high = float(high.iloc[-lookback:-1].max())
    recent_low  = float(low.iloc[-lookback:-1].min())
    price       = _last(close)
    prev_price  = _prev(close)
    atr_val     = _last(_atr(df, 14))
    buffer      = atr_val * 0.2

    breakout_up   = prev_price <= recent_high and price > recent_high + buffer
    breakout_down = prev_price >= recent_low  and price < recent_low - buffer

    if breakout_up:
        signal, confidence = "BUY", 0.70
    elif breakout_down:
        signal, confidence = "SELL", 0.70
    else:
        signal, confidence = "HOLD", 0.0

    return StrategyResult(
        strategy="Breakout",
        signal=signal,
        confidence=confidence,
        timeframe="1h",
        details=f"Range {recent_low:.5f}–{recent_high:.5f} · Price={price:.5f}",
        indicators={"recent_high": round(recent_high, 5), "recent_low": round(recent_low, 5),
                    "atr": round(atr_val, 5), "breakout_up": breakout_up},
    )


# ── Strategy 4: Pullback ──────────────────────────────────────────────────────

def strategy_pullback_macd(dfs: dict) -> StrategyResult:
    """EMA50 trend + bounce off EMA21 with RSI confirm. Uses 1h data."""
    df = dfs.get("1h") if "1h" in dfs else next(iter(dfs.values()))
    close = df["Close"]

    ema21 = _ema(close, 21)
    ema50 = _ema(close, 50)
    rsi   = _rsi(close, 14)
    atr   = _atr(df, 14)

    price    = _last(close)
    prev     = _prev(close)
    e21      = _last(ema21)
    e50_now  = _last(ema50)
    e50_prev = float(ema50.iloc[-5])
    rsi_now  = _last(rsi)
    atr_val  = _last(atr)
    tolerance = atr_val * 0.5

    trend_up = e50_now > e50_prev
    trend_dn = e50_now < e50_prev
    near_ema21 = abs(price - e21) <= tolerance

    bouncing_up   = near_ema21 and prev < price and trend_up  and rsi_now > 40
    bouncing_down = near_ema21 and prev > price and trend_dn  and rsi_now < 60

    if bouncing_up:
        signal, confidence = "BUY", 0.85
    elif bouncing_down:
        signal, confidence = "SELL", 0.85
    else:
        signal, confidence = "HOLD", 0.0

    return StrategyResult(
        strategy="Pullback + MACD",
        signal=signal,
        confidence=confidence,
        timeframe="1h",
        details=f"{'Uptrend' if trend_up else 'Downtrend'} · Near EMA21={e21:.5f} · RSI={rsi_now:.1f}",
        indicators={"ema21": round(e21, 5), "rsi": round(rsi_now, 2),
                    "near_ema21": near_ema21, "trend_up": trend_up},
    )


# ── Aggregator ────────────────────────────────────────────────────────────────

def run_all_strategies(dfs: dict, weights: dict = None) -> dict:
    """
    Run all 4 strategies and combine with weighted voting.
    Threshold: normalised score >= 0.40 (v1 proven threshold).
    """
    results = [
        strategy_ema_crossover(dfs),
        strategy_trend_follow(dfs),
        strategy_breakout(dfs),
        strategy_pullback_macd(dfs),
    ]

    total_score = 0.0
    total_confidence = 0.0
    for r in results:
        w = (weights or {}).get(r.strategy, 1.0)
        weighted = r.confidence * w
        if r.signal == "BUY":
            total_score += weighted
        elif r.signal == "SELL":
            total_score -= weighted
        total_confidence += weighted

    n = len(results)
    avg_confidence = total_confidence / n
    normalised     = total_score / n   # -1 to +1

    agreeing_buy  = sum(1 for r in results if r.signal == "BUY")
    agreeing_sell = sum(1 for r in results if r.signal == "SELL")

    if normalised >= 0.15:
        final_signal = "BUY"
        final_confidence = min(0.95, avg_confidence + 0.1)
    elif normalised <= -0.15:
        final_signal = "SELL"
        final_confidence = min(0.95, avg_confidence + 0.1)
    else:
        final_signal = "HOLD"
        final_confidence = 0.0

    return {
        "final_signal":     final_signal,
        "final_confidence": round(final_confidence, 3),
        "score":            round(normalised, 3),
        "agreeing":         agreeing_buy if final_signal == "BUY" else agreeing_sell if final_signal == "SELL" else 0,
        "strategies": {r.strategy: {
            "signal":     r.signal,
            "confidence": r.confidence,
            "timeframe":  r.timeframe,
            "details":    r.details,
            "indicators": r.indicators,
        } for r in results},
    }