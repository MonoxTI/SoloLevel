"""
Fetch multi-timeframe OHLC data from Deriv API and convert to pandas DataFrames
compatible with the existing v2 strategy engine.
"""
import logging
from datetime import datetime
import pandas as pd
from .client import DerivClient

logger = logging.getLogger(__name__)

# Deriv granularity in seconds
GRANULARITIES = {
    "1h":  3600,
    "4h":  14400,
    "1d":  86400,
}


def candles_to_df(candles: list[dict]) -> pd.DataFrame:
    """Convert Deriv candle list to OHLCV DataFrame matching v2 strategy format."""
    if not candles:
        raise ValueError("No candles returned")
    df = pd.DataFrame(candles)
    df["epoch"] = pd.to_datetime(df["epoch"], unit="s")
    df = df.rename(columns={
        "epoch": "Date",
        "open":  "Open",
        "high":  "High",
        "low":   "Low",
        "close": "Close",
    })
    df["Volume"] = 0  # Deriv doesn't provide volume for synthetic indices
    df = df.set_index("Date")[["Open", "High", "Low", "Close", "Volume"]]
    df = df.astype(float)
    return df


async def fetch_all_timeframes(client: DerivClient, symbol: str) -> dict[str, pd.DataFrame]:
    """
    Fetch 1h, 4h, and 1d candles for a symbol.
    Returns {"1h": df, "4h": df, "1d": df}
    """
    result = {}
    errors = []

    for tf, granularity in GRANULARITIES.items():
        count = 500 if tf == "1h" else 300 if tf == "4h" else 200
        try:
            candles = await client.get_candles(symbol, granularity=granularity, count=count)
            result[tf] = candles_to_df(candles)
            logger.debug(f"Fetched {len(result[tf])} {tf} candles for {symbol}")
        except Exception as e:
            errors.append(f"{tf}: {e}")
            logger.warning(f"Failed to fetch {tf} data for {symbol}: {e}")

    if not result:
        raise ValueError(f"No data for {symbol}. Errors: {'; '.join(errors)}")

    # Fill missing timeframes from what we have
    if "1h" not in result and "4h" in result:
        result["1h"] = result["4h"]
    if "4h" not in result and "1h" in result:
        result["4h"] = result["1h"]
    if "1d" not in result and "4h" in result:
        result["1d"] = result["4h"]

    return result