"""
Forex v2 strategies.
Each strategy receives a dict of DataFrames (one per timeframe) and returns
a StrategyResult — a consistent interface the engine can aggregate.

Strategies:
  1. EMA Crossover    — 1h signal, 4h trend filter
  2. Trend Follow     — 4h EMA200 trend + 1h RSI entry
  3. Breakout         — 1d range, 4h confirm, 1h entry
  4. Pullback + MACD  — 1h bounce off EMA21 with MACD histogram flip
"""
from dataclasses import dataclass, field
from typing import Optional
import pandas as pd

from .indicators import ema, rsi, macd, atr, bollinger_bands, adx, stochastic


@dataclass
class StrategyResult:
    strategy: str
    signal: str           # BUY | SELL | HOLD
    confidence: float     # 0.0 – 1.0
    timeframe: str        # primary timeframe used
    details: str          # human-readable summary
    indicators: dict = field(default_factory=dict)  # raw values for debugging


def _last(series: pd.Series) -> float:
    return float(series.iloc[-1])

def _prev(series: pd.Series, n: int = 1) -> float:
    return float(series.iloc[-(n + 1)])


# ── Strategy 1: EMA Crossover with trend filter ───────────────────────────────

def strategy_ema_crossover(dfs: dict[str, pd.DataFrame]) -> StrategyResult:
    """
    1h: EMA9 crosses EMA21 (signal)
    4h: Price above/below EMA50 (trend filter)
    Confidence boosted when both timeframes agree.
    """
    df1h = dfs.get("1h")
    df4h = dfs.get("4h")

    close1h = df1h["Close"]
    ema9  = ema(close1h, 9)
    ema21 = ema(close1h, 21)

    curr_fast, prev_fast = _last(ema9), _prev(ema9)
    curr_slow, prev_slow = _last(ema21), _prev(ema21)

    bullish_cross = prev_fast <= prev_slow and curr_fast > curr_slow
    bearish_cross = prev_fast >= prev_slow and curr_fast < curr_slow

    # 4h trend filter
    trend = "neutral"
    if df4h is not None and len(df4h) >= 50:
        close4h = df4h["Close"]
        ema50_4h = ema(close4h, 50)
        price4h  = _last(close4h)
        trend = "up" if price4h > _last(ema50_4h) else "down"

    if bullish_cross and trend == "up":
        signal, confidence = "BUY", 0.80
    elif bearish_cross and trend == "down":
        signal, confidence = "SELL", 0.80
    elif bullish_cross and trend == "neutral":
        signal, confidence = "BUY", 0.60
    elif bearish_cross and trend == "neutral":
        signal, confidence = "SELL", 0.60
    elif bullish_cross:
        signal, confidence = "BUY", 0.45  # counter-trend, lower confidence
    elif bearish_cross:
        signal, confidence = "SELL", 0.45
    else:
        signal, confidence = "HOLD", 0.0

    return StrategyResult(
        strategy="EMA Crossover",
        signal=signal,
        confidence=confidence,
        timeframe="1h",
        details=f"EMA9={curr_fast:.5f} {'>' if curr_fast > curr_slow else '<'} EMA21={curr_slow:.5f} · 4h trend={trend}",
        indicators={
            "ema9_1h": round(curr_fast, 5),
            "ema21_1h": round(curr_slow, 5),
            "4h_trend": trend,
            "bullish_cross": bullish_cross,
            "bearish_cross": bearish_cross,
        },
    )


# ── Strategy 2: Trend Follow (multi-timeframe) ────────────────────────────────

def strategy_trend_follow(dfs: dict[str, pd.DataFrame]) -> StrategyResult:
    """
    1d: EMA200 defines macro trend
    4h: EMA50 direction confirms
    1h: RSI pullback entry (oversold in uptrend, overbought in downtrend)
    ADX > 20 required to confirm trend strength.
    """
    df1h = dfs.get("1h")
    df4h = dfs.get("4h")
    df1d = dfs.get("1d")

    close1h = df1h["Close"]
    rsi1h   = rsi(close1h, 14)
    rsi_now = _last(rsi1h)

    # Daily trend via EMA200
    macro_trend = "neutral"
    if df1d is not None and len(df1d) >= 200:
        ema200_1d = ema(df1d["Close"], 200)
        macro_trend = "up" if _last(df1d["Close"]) > _last(ema200_1d) else "down"

    # 4h trend via EMA50 slope
    mid_trend = "neutral"
    adx_val   = 0.0
    if df4h is not None and len(df4h) >= 50:
        ema50_4h  = ema(df4h["Close"], 50)
        adx_4h    = adx(df4h, 14)
        adx_val   = _last(adx_4h)
        mid_trend = "up" if _last(ema50_4h) > _prev(ema50_4h, 3) else "down"

    trends_agree = macro_trend == mid_trend and macro_trend != "neutral"
    strong_trend = adx_val >= 20

    rsi_entry_buy  = rsi_now < 45
    rsi_entry_sell = rsi_now > 55

    if trends_agree and strong_trend and macro_trend == "up" and rsi_entry_buy:
        signal, confidence = "BUY", 0.85
    elif trends_agree and strong_trend and macro_trend == "down" and rsi_entry_sell:
        signal, confidence = "SELL", 0.85
    elif trends_agree and macro_trend == "up" and rsi_entry_buy:
        signal, confidence = "BUY", 0.65
    elif trends_agree and macro_trend == "down" and rsi_entry_sell:
        signal, confidence = "SELL", 0.65
    elif macro_trend == "up" and rsi_entry_buy:
        signal, confidence = "BUY", 0.50
    elif macro_trend == "down" and rsi_entry_sell:
        signal, confidence = "SELL", 0.50
    else:
        signal, confidence = "HOLD", 0.0

    return StrategyResult(
        strategy="Trend Follow",
        signal=signal,
        confidence=confidence,
        timeframe="4h",
        details=f"1d={macro_trend} · 4h={mid_trend} · ADX={adx_val:.1f} · RSI1h={rsi_now:.1f}",
        indicators={
            "macro_trend": macro_trend,
            "mid_trend": mid_trend,
            "adx_4h": round(adx_val, 2),
            "rsi_1h": round(rsi_now, 2),
            "trends_agree": trends_agree,
            "strong_trend": strong_trend,
        },
    )


# ── Strategy 3: Breakout ──────────────────────────────────────────────────────

def strategy_breakout(dfs: dict[str, pd.DataFrame], lookback: int = 20) -> StrategyResult:
    """
    1d: Define the range (high/low over lookback period)
    4h: Confirm break is holding (close above/below on 4h candle)
    1h: Entry — price still outside range and ATR confirms move size.
    Bollinger Band squeeze on 4h adds confidence (post-squeeze breakout).
    """
    df1h = dfs.get("1h")
    df4h = dfs.get("4h", df1h)
    df1d = dfs.get("1d", df4h)

    # Range from daily
    recent_high = float(df1d["High"].iloc[-lookback:-1].max())
    recent_low  = float(df1d["Low"].iloc[-lookback:-1].min())

    price1h  = _last(df1h["Close"])
    prev1h   = _prev(df1h["Close"])
    atr1h    = _last(atr(df1h, 14))
    buffer   = atr1h * 0.25

    breakout_up   = prev1h <= recent_high and price1h > recent_high + buffer
    breakout_down = prev1h >= recent_low  and price1h < recent_low - buffer

    # BB squeeze on 4h: bandwidth < 1% of price suggests consolidation before move
    bb_squeeze = False
    if len(df4h) >= 20:
        upper4h, mid4h, lower4h = bollinger_bands(df4h["Close"], 20)
        bw = (_last(upper4h) - _last(lower4h)) / _last(mid4h)
        bb_squeeze = bw < 0.01

    confidence_base = 0.75
    if bb_squeeze:
        confidence_base = 0.82  # post-squeeze breakouts are stronger

    if breakout_up:
        signal, confidence = "BUY", confidence_base
    elif breakout_down:
        signal, confidence = "SELL", confidence_base
    else:
        signal, confidence = "HOLD", 0.0

    return StrategyResult(
        strategy="Breakout",
        signal=signal,
        confidence=confidence,
        timeframe="1d",
        details=f"Range {recent_low:.5f}–{recent_high:.5f} · Price={price1h:.5f} · BB squeeze={bb_squeeze}",
        indicators={
            "range_high": round(recent_high, 5),
            "range_low": round(recent_low, 5),
            "atr_1h": round(atr1h, 5),
            "bb_squeeze": bb_squeeze,
            "breakout_up": breakout_up,
            "breakout_down": breakout_down,
        },
    )


# ── Strategy 4: Pullback + MACD ───────────────────────────────────────────────

def strategy_pullback_macd(dfs: dict[str, pd.DataFrame]) -> StrategyResult:
    """
    4h: Trend direction (EMA50 slope)
    1h: Price pulls back to EMA21, MACD histogram flips in trend direction.
    Stochastic confirmation: oversold (< 25) for buy, overbought (> 75) for sell.
    """
    df1h = dfs.get("1h")
    df4h = dfs.get("4h", df1h)

    close1h = df1h["Close"]
    ema21_1h = ema(close1h, 21)
    atr1h    = atr(df1h, 14)

    price     = _last(close1h)
    prev      = _prev(close1h)
    e21       = _last(ema21_1h)
    atr_val   = _last(atr1h)
    tolerance = atr_val * 0.5

    near_ema21 = abs(price - e21) <= tolerance

    # MACD histogram flip on 1h
    macd_line, sig_line, hist = macd(close1h)
    hist_now  = _last(hist)
    hist_prev = _prev(hist)
    macd_flip_up   = hist_prev < 0 and hist_now > 0
    macd_flip_down = hist_prev > 0 and hist_now < 0

    # Stochastic on 1h
    k, d = stochastic(df1h, 14, 3)
    k_now = _last(k)
    oversold    = k_now < 25
    overbought  = k_now > 75

    # 4h trend
    trend = "neutral"
    if len(df4h) >= 50:
        ema50_4h = ema(df4h["Close"], 50)
        trend = "up" if _last(ema50_4h) > _prev(ema50_4h, 3) else "down"

    bouncing_up   = near_ema21 and price > prev and trend == "up"
    bouncing_down = near_ema21 and price < prev and trend == "down"

    if bouncing_up and macd_flip_up and oversold:
        signal, confidence = "BUY", 0.90
    elif bouncing_down and macd_flip_down and overbought:
        signal, confidence = "SELL", 0.90
    elif bouncing_up and macd_flip_up:
        signal, confidence = "BUY", 0.75
    elif bouncing_down and macd_flip_down:
        signal, confidence = "SELL", 0.75
    elif bouncing_up:
        signal, confidence = "BUY", 0.55
    elif bouncing_down:
        signal, confidence = "SELL", 0.55
    else:
        signal, confidence = "HOLD", 0.0

    return StrategyResult(
        strategy="Pullback + MACD",
        signal=signal,
        confidence=confidence,
        timeframe="1h",
        details=f"Near EMA21={e21:.5f} · MACD flip={'up' if macd_flip_up else 'down' if macd_flip_down else 'none'} · Stoch K={k_now:.1f} · 4h={trend}",
        indicators={
            "ema21_1h": round(e21, 5),
            "near_ema21": near_ema21,
            "macd_hist_1h": round(hist_now, 6),
            "macd_flip_up": macd_flip_up,
            "macd_flip_down": macd_flip_down,
            "stoch_k": round(k_now, 2),
            "oversold": oversold,
            "overbought": overbought,
            "4h_trend": trend,
        },
    )


# ── Aggregator ────────────────────────────────────────────────────────────────

def run_all_strategies(dfs: dict[str, pd.DataFrame],
                       weights: dict[str, float] = None) -> dict:
    """
    Run all 4 strategies and combine with weighted voting.
    weights: per-strategy multipliers (default 1.0 each).
    Returns dict with final_signal, final_confidence, score, strategies list.
    """
    default_weights = {
        "EMA Crossover":  1.0,
        "Trend Follow":   1.0,
        "Breakout":       1.0,
        "Pullback + MACD": 1.0,
    }
    if weights:
        default_weights.update(weights)

    results: list[StrategyResult] = [
        strategy_ema_crossover(dfs),
        strategy_trend_follow(dfs),
        strategy_breakout(dfs),
        strategy_pullback_macd(dfs),
    ]

    total_score = 0.0
    total_weight = 0.0

    for r in results:
        w = default_weights.get(r.strategy, 1.0)
        weighted_conf = r.confidence * w
        if r.signal == "BUY":
            total_score += weighted_conf
        elif r.signal == "SELL":
            total_score -= weighted_conf
        total_weight += weighted_conf if r.signal != "HOLD" else 0

    n = len(results)
    normalised = total_score / (total_weight if total_weight > 0 else 1)

    # Threshold: need at least 2 strategies agreeing with score >= 0.35
    agreeing_buy  = sum(1 for r in results if r.signal == "BUY")
    agreeing_sell = sum(1 for r in results if r.signal == "SELL")

    if normalised >= 0.35 and agreeing_buy >= 2:
        final_signal = "BUY"
        final_confidence = min(0.95, sum(r.confidence for r in results if r.signal == "BUY") / n + 0.05)
    elif normalised <= -0.35 and agreeing_sell >= 2:
        final_signal = "SELL"
        final_confidence = min(0.95, sum(r.confidence for r in results if r.signal == "SELL") / n + 0.05)
    else:
        final_signal = "HOLD"
        final_confidence = 0.0

    return {
        "final_signal": final_signal,
        "final_confidence": round(final_confidence, 3),
        "score": round(normalised, 3),
        "agreeing": agreeing_buy if final_signal == "BUY" else agreeing_sell if final_signal == "SELL" else 0,
        "strategies": {r.strategy: {
            "signal": r.signal,
            "confidence": r.confidence,
            "timeframe": r.timeframe,
            "details": r.details,
            "indicators": r.indicators,
        } for r in results},
    }