"""
Forex v2 strategies — practical conditions that fire in real market conditions.
"""
from dataclasses import dataclass, field
import pandas as pd
import numpy as np


@dataclass
class StrategyResult:
    strategy: str
    signal: str
    confidence: float
    timeframe: str
    details: str
    indicators: dict = field(default_factory=dict)


# ── Indicators ────────────────────────────────────────────────────────────────

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


# ── Strategy 1: EMA Trend ─────────────────────────────────────────────────────

def strategy_ema_crossover(dfs: dict) -> StrategyResult:
    """
    EMA20 vs EMA50 alignment + EMA200 trend.
    Fires when fast EMA is above/below slow EMA (not just at crossover).
    """
    df = dfs.get("1h") if "1h" in dfs else next(iter(dfs.values()))
    close = df["Close"]

    ema20  = _ema(close, 20)
    ema50  = _ema(close, 50)
    ema200 = _ema(close, 200)

    e20  = _last(ema20)
    e50  = _last(ema50)
    e200 = _last(ema200)
    price = _last(close)

    # EMA alignment — bullish when 20 > 50 > 200
    bull_align = e20 > e50 and price > e200
    bear_align = e20 < e50 and price < e200

    # Recent crossover (last 3 bars)
    cross_up   = any(_prev(ema20, i) <= _prev(ema50, i) and
                     _prev(ema20, i-1) > _prev(ema50, i-1)
                     for i in range(1, 4))
    cross_down = any(_prev(ema20, i) >= _prev(ema50, i) and
                     _prev(ema20, i-1) < _prev(ema50, i-1)
                     for i in range(1, 4))

    if cross_up and bull_align:
        signal, confidence = "BUY", 0.75
    elif cross_down and bear_align:
        signal, confidence = "SELL", 0.75
    elif bull_align:
        signal, confidence = "BUY", 0.55
    elif bear_align:
        signal, confidence = "SELL", 0.55
    else:
        signal, confidence = "HOLD", 0.0

    return StrategyResult(
        strategy="EMA Crossover",
        signal=signal,
        confidence=confidence,
        timeframe="1h",
        details=f"EMA20={e20:.5f} {'>' if e20 > e50 else '<'} EMA50={e50:.5f} · trend={'up' if price > e200 else 'dn'}",
        indicators={"ema20": round(e20, 5), "ema50": round(e50, 5), "ema200": round(e200, 5)},
    )


# ── Strategy 2: Trend + RSI ───────────────────────────────────────────────────

def strategy_trend_follow(dfs: dict) -> StrategyResult:
    """
    EMA200 defines trend. RSI range filter (not overbought/oversold).
    BUY in uptrend when RSI < 65. SELL in downtrend when RSI > 35.
    Much wider RSI window than original.
    """
    df = dfs.get("1h") if "1h" in dfs else next(iter(dfs.values()))
    close = df["Close"]

    ema200 = _ema(close, 200)
    ema50  = _ema(close, 50)
    rsi    = _rsi(close, 14)

    price   = _last(close)
    e200    = _last(ema200)
    e50     = _last(ema50)
    rsi_now = _last(rsi)

    uptrend   = price > e200 and e50 > e200
    downtrend = price < e200 and e50 < e200

    # Wide RSI filter — just avoid extreme overbought/oversold
    rsi_ok_buy  = rsi_now < 68
    rsi_ok_sell = rsi_now > 32

    if uptrend and rsi_ok_buy:
        # Higher confidence when RSI pulling back from mid-range
        conf = 0.70 if rsi_now < 55 else 0.55
        signal, confidence = "BUY", conf
    elif downtrend and rsi_ok_sell:
        conf = 0.70 if rsi_now > 45 else 0.55
        signal, confidence = "SELL", conf
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
    """
    Price breaks 20-bar high/low with small ATR buffer.
    Also fires on near-breakout (within 10% of ATR from the level).
    """
    df = dfs.get("1h") if "1h" in dfs else next(iter(dfs.values()))
    close, high, low = df["Close"], df["High"], df["Low"]

    recent_high = float(high.iloc[-lookback:-1].max())
    recent_low  = float(low.iloc[-lookback:-1].min())
    price       = _last(close)
    atr_val     = _last(_atr(df, 14))
    buffer      = atr_val * 0.1   # 10% of ATR (was 20%)

    breakout_up   = price > recent_high - buffer   # at or above resistance
    breakout_down = price < recent_low  + buffer   # at or below support

    # Prefer confirmed break
    confirmed_up   = price > recent_high + buffer
    confirmed_down = price < recent_low  - buffer

    if confirmed_up:
        signal, confidence = "BUY", 0.75
    elif confirmed_down:
        signal, confidence = "SELL", 0.75
    elif breakout_up:
        signal, confidence = "BUY", 0.60
    elif breakout_down:
        signal, confidence = "SELL", 0.60
    else:
        signal, confidence = "HOLD", 0.0

    return StrategyResult(
        strategy="Breakout",
        signal=signal,
        confidence=confidence,
        timeframe="1h",
        details=f"Range {recent_low:.5f}–{recent_high:.5f} · Price={price:.5f} · ATR={atr_val:.5f}",
        indicators={"recent_high": round(recent_high, 5), "recent_low": round(recent_low, 5),
                    "atr": round(atr_val, 5)},
    )


# ── Strategy 4: Pullback ──────────────────────────────────────────────────────

def strategy_pullback_macd(dfs: dict) -> StrategyResult:
    """
    EMA50 trend + price near EMA21.
    Wider tolerance (1.5× ATR) and wider RSI window.
    """
    df = dfs.get("1h") if "1h" in dfs else next(iter(dfs.values()))
    close = df["Close"]

    ema21 = _ema(close, 21)
    ema50 = _ema(close, 50)
    rsi   = _rsi(close, 14)
    atr   = _atr(df, 14)

    price    = _last(close)
    e21      = _last(ema21)
    e50_now  = _last(ema50)
    e50_prev = float(ema50.iloc[-5])
    rsi_now  = _last(rsi)
    atr_val  = _last(atr)
    tolerance = atr_val * 1.5   # wider tolerance — was 0.5

    trend_up = e50_now > e50_prev
    trend_dn = e50_now < e50_prev
    near_ema21 = abs(price - e21) <= tolerance

    # Wider RSI windows
    bouncing_up   = near_ema21 and trend_up  and rsi_now < 65
    bouncing_down = near_ema21 and trend_dn  and rsi_now > 35

    if bouncing_up:
        conf = 0.85 if rsi_now < 50 else 0.65
        signal, confidence = "BUY", conf
    elif bouncing_down:
        conf = 0.85 if rsi_now > 50 else 0.65
        signal, confidence = "SELL", conf
    else:
        signal, confidence = "HOLD", 0.0

    return StrategyResult(
        strategy="Pullback + MACD",
        signal=signal,
        confidence=confidence,
        timeframe="1h",
        details=f"{'Uptrend' if trend_up else 'Downtrend'} · Near EMA21={e21:.5f}({near_ema21}) · RSI={rsi_now:.1f}",
        indicators={"ema21": round(e21, 5), "rsi": round(rsi_now, 2),
                    "near_ema21": near_ema21, "tolerance": round(tolerance, 5),
                    "trend_up": trend_up, "trend_dn": trend_dn},
    )


# ── Aggregator ────────────────────────────────────────────────────────────────

def run_all_strategies(dfs: dict, weights: dict = None) -> dict:
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
    normalised = total_score / n

    agreeing_buy  = sum(1 for r in results if r.signal == "BUY")
    agreeing_sell = sum(1 for r in results if r.signal == "SELL")

    if normalised >= 0.15:
        final_signal = "BUY"
        final_confidence = min(0.95, total_confidence / n + 0.05)
    elif normalised <= -0.15:
        final_signal = "SELL"
        final_confidence = min(0.95, total_confidence / n + 0.05)
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