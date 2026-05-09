"""
Trading algorithm — RSI + MACD signals on JSE stocks.
Uses yfinance to fetch price data.
"""
import yfinance as yf
import pandas as pd
from datetime import datetime
from typing import Optional


# JSE stocks to watch — .JO suffix for Johannesburg Stock Exchange
DEFAULT_WATCHLIST = [
    "NPN.JO",   # Naspers
    "SOL.JO",   # Sasol
    "MTN.JO",   # MTN Group
    "ABG.JO",   # Absa Group
    "SBK.JO",   # Standard Bank
    "FSR.JO",   # FirstRand
    "AGL.JO",   # Anglo American
    "BHP.JO",   # BHP Group
    "VOD.JO",   # Vodacom
    "CPI.JO",   # Capitec
]


def fetch_prices(symbol: str, period: str = "3mo", interval: str = "1d") -> pd.DataFrame:
    """Fetch OHLCV data from yfinance."""
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, interval=interval)
    if df.empty:
        raise ValueError(f"No data returned for {symbol}")
    return df


def calc_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def calc_macd(series: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Returns (macd_line, signal_line, histogram)."""
    ema12 = series.ewm(span=12, adjust=False).mean()
    ema26 = series.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    histogram = macd - signal
    return macd, signal, histogram


def calc_bollinger(series: pd.Series, period: int = 20) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Returns (upper_band, middle_band, lower_band)."""
    middle = series.rolling(window=period).mean()
    std = series.rolling(window=period).std()
    upper = middle + (std * 2)
    lower = middle - (std * 2)
    return upper, middle, lower


def analyse_signal(symbol: str) -> dict:
    """
    Runs RSI + MACD + Bollinger analysis on a symbol.
    Returns a signal dict with BUY / SELL / HOLD recommendation.
    """
    try:
        df = fetch_prices(symbol)
        close = df["Close"]

        # Indicators
        rsi = calc_rsi(close)
        macd_line, signal_line, histogram = calc_macd(close)
        upper_bb, mid_bb, lower_bb = calc_bollinger(close)

        # Latest values
        latest_rsi = round(float(rsi.iloc[-1]), 2)
        latest_macd = round(float(macd_line.iloc[-1]), 4)
        latest_signal = round(float(signal_line.iloc[-1]), 4)
        latest_hist = round(float(histogram.iloc[-1]), 4)
        prev_hist = round(float(histogram.iloc[-2]), 4)
        latest_price = round(float(close.iloc[-1]), 2)
        latest_upper_bb = round(float(upper_bb.iloc[-1]), 2)
        latest_lower_bb = round(float(lower_bb.iloc[-1]), 2)

        # Signal logic
        signals = []
        score = 0  # positive = bullish, negative = bearish

        # RSI signals
        if latest_rsi < 30:
            signals.append("RSI oversold (<30) → bullish")
            score += 2
        elif latest_rsi < 45:
            signals.append("RSI low (30-45) → mildly bullish")
            score += 1
        elif latest_rsi > 70:
            signals.append("RSI overbought (>70) → bearish")
            score -= 2
        elif latest_rsi > 55:
            signals.append("RSI high (55-70) → mildly bearish")
            score -= 1

        # MACD crossover signals
        if latest_hist > 0 and prev_hist <= 0:
            signals.append("MACD bullish crossover → strong buy")
            score += 3
        elif latest_hist < 0 and prev_hist >= 0:
            signals.append("MACD bearish crossover → strong sell")
            score -= 3
        elif latest_hist > 0:
            signals.append("MACD positive → bullish momentum")
            score += 1
        else:
            signals.append("MACD negative → bearish momentum")
            score -= 1

        # Bollinger Band signals
        if latest_price <= latest_lower_bb:
            signals.append("Price at lower Bollinger Band → oversold")
            score += 2
        elif latest_price >= latest_upper_bb:
            signals.append("Price at upper Bollinger Band → overbought")
            score -= 2

        # Final recommendation
        if score >= 3:
            recommendation = "BUY"
        elif score <= -3:
            recommendation = "SELL"
        else:
            recommendation = "HOLD"

        return {
            "symbol": symbol,
            "price": latest_price,
            "rsi": latest_rsi,
            "macd": latest_macd,
            "macd_signal": latest_signal,
            "macd_histogram": latest_hist,
            "upper_bb": latest_upper_bb,
            "lower_bb": latest_lower_bb,
            "score": score,
            "signals": signals,
            "recommendation": recommendation,
            "analysed_at": datetime.utcnow().isoformat(),
            "error": None,
        }

    except Exception as e:
        return {
            "symbol": symbol,
            "price": None,
            "recommendation": "ERROR",
            "signals": [],
            "score": 0,
            "error": str(e),
            "analysed_at": datetime.utcnow().isoformat(),
        }


def scan_watchlist(symbols: list[str] = DEFAULT_WATCHLIST) -> list[dict]:
    """Scan all symbols and return sorted by signal strength."""
    results = [analyse_signal(s) for s in symbols]
    # Sort: BUY first, then HOLD, then SELL, then ERROR
    order = {"BUY": 0, "HOLD": 1, "SELL": 2, "ERROR": 3}
    return sorted(results, key=lambda x: (order.get(x["recommendation"], 3), -x["score"]))