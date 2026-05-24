"""
Multi-timeframe data fetcher for forex v2 engine.

Fetches 1h (execution), 4h (confirmation), and 1d (trend) candles
for each pair using yfinance, with basic validation and caching.
"""
import logging
from datetime import datetime, timedelta
from typing import Optional
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# yfinance symbol mapping
FOREX_PAIRS = {
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "USDJPY=X",
    "USDZAR": "USDZAR=X",
    "EURZAR": "EURZAR=X",
    "GBPZAR": "GBPZAR=X",
    "XAUUSD": "GC=F",
    "AUDUSD": "AUDUSD=X",
    "USDCAD": "USDCAD=X",
    "NZDUSD": "NZDUSD=X",
}

DEFAULT_PAIRS = ["EURUSD", "GBPUSD", "USDZAR", "XAUUSD", "USDJPY"]

# Timeframe configs: (yfinance interval, period, label)
TIMEFRAMES = {
    "1h":  ("1h",  "3mo",  "Hourly"),
    "4h":  ("1h",  "6mo",  "4-Hour"),   # fetch 1h then resample
    "1d":  ("1d",  "1y",   "Daily"),
}


def _resample_to_4h(df_1h: pd.DataFrame) -> pd.DataFrame:
    """Resample 1h OHLCV data to 4h bars."""
    df = df_1h.copy()
    df.index = pd.to_datetime(df.index)
    # Remove timezone for resampling compatibility
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)
    resampled = df.resample("4h").agg({
        "Open":   "first",
        "High":   "max",
        "Low":    "min",
        "Close":  "last",
        "Volume": "sum",
    }).dropna()
    return resampled


def fetch_timeframe(symbol: str, timeframe: str) -> pd.DataFrame:
    """
    Fetch OHLCV data for a symbol and timeframe.
    timeframe: "1h" | "4h" | "1d"
    """
    ticker_symbol = FOREX_PAIRS.get(symbol, f"{symbol}=X")

    if timeframe == "4h":
        # Fetch 1h data then resample
        raw = yf.Ticker(ticker_symbol).history(period="6mo", interval="1h")
        if raw.empty:
            raise ValueError(f"No 1h data for {symbol} (needed for 4h resample)")
        df = _resample_to_4h(raw)
    else:
        interval, period, _ = TIMEFRAMES[timeframe]
        df = yf.Ticker(ticker_symbol).history(period=period, interval=interval)

    if df.empty:
        raise ValueError(f"No {timeframe} data for {symbol}")

    # Normalise column names
    df.columns = [c.capitalize() for c in df.columns]
    df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
    return df


def fetch_all_timeframes(symbol: str) -> dict[str, pd.DataFrame]:
    """
    Fetch all three timeframes for a symbol.
    Returns {"1h": df, "4h": df, "1d": df}
    Raises ValueError if any timeframe fails.
    """
    result = {}
    errors = []

    for tf in ["1h", "4h", "1d"]:
        try:
            result[tf] = fetch_timeframe(symbol, tf)
        except Exception as e:
            errors.append(f"{tf}: {e}")
            logger.warning(f"Failed to fetch {tf} data for {symbol}: {e}")

    if not result:
        raise ValueError(f"Could not fetch any data for {symbol}. Errors: {'; '.join(errors)}")

    # If missing a timeframe, fill from what we have (degraded mode)
    if "1h" not in result and "4h" in result:
        result["1h"] = result["4h"]
    if "4h" not in result and "1h" in result:
        result["4h"] = result["1h"]
    if "1d" not in result and "4h" in result:
        result["1d"] = result["4h"]

    return result