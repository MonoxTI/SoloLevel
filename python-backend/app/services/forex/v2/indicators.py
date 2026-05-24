"""
Pure indicator functions for the forex v2 engine.
All functions take a pd.Series or pd.DataFrame and return a pd.Series.
No side effects, no state — safe to call across timeframes.
"""
import pandas as pd
import numpy as np


def ema(series: pd.Series, period: int) -> pd.Series:
    """Exponential moving average."""
    return series.ewm(span=period, adjust=False).mean()


def sma(series: pd.Series, period: int) -> pd.Series:
    """Simple moving average."""
    return series.rolling(window=period).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """
    Relative Strength Index (Wilder's smoothing).
    Returns values 0–100.
    """
    delta = series.diff()
    gain = delta.clip(lower=0).ewm(com=period - 1, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(com=period - 1, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - (100 / (1 + rs))).fillna(50)


def macd(series: pd.Series,
         fast: int = 12, slow: int = 26, signal: int = 9
         ) -> tuple[pd.Series, pd.Series, pd.Series]:
    """
    MACD indicator.
    Returns (macd_line, signal_line, histogram).
    """
    ema_fast = ema(series, fast)
    ema_slow = ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Average True Range.
    Measures volatility — larger = more volatile.
    """
    high, low, close = df["High"], df["Low"], df["Close"]
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()


def bollinger_bands(series: pd.Series,
                    period: int = 20, std_dev: float = 2.0
                    ) -> tuple[pd.Series, pd.Series, pd.Series]:
    """
    Bollinger Bands.
    Returns (upper_band, middle_band, lower_band).
    """
    middle = sma(series, period)
    std = series.rolling(window=period).std()
    upper = middle + (std * std_dev)
    lower = middle - (std * std_dev)
    return upper, middle, lower


def stochastic(df: pd.DataFrame,
               k_period: int = 14, d_period: int = 3
               ) -> tuple[pd.Series, pd.Series]:
    """
    Stochastic oscillator.
    Returns (%K, %D).
    """
    low_min  = df["Low"].rolling(window=k_period).min()
    high_max = df["High"].rolling(window=k_period).max()
    denom = (high_max - low_min).replace(0, np.nan)
    k = 100 * (df["Close"] - low_min) / denom
    d = sma(k, d_period)
    return k.fillna(50), d.fillna(50)


def adx(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """
    Average Directional Index (ADX).
    Values above 25 indicate a trending market.
    """
    high, low, close = df["High"], df["Low"], df["Close"]

    plus_dm  = (high.diff()).clip(lower=0)
    minus_dm = (-low.diff()).clip(lower=0)

    # When +DM < -DM, set +DM to 0, and vice versa
    mask = plus_dm < minus_dm
    plus_dm_clean  = plus_dm.where(~mask, 0)
    minus_dm_clean = minus_dm.where(mask, 0)

    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs(),
    ], axis=1).max(axis=1)

    atr_val    = tr.ewm(span=period, adjust=False).mean()
    plus_di    = 100 * plus_dm_clean.ewm(span=period, adjust=False).mean() / atr_val.replace(0, np.nan)
    minus_di   = 100 * minus_dm_clean.ewm(span=period, adjust=False).mean() / atr_val.replace(0, np.nan)
    dx_denom   = (plus_di + minus_di).replace(0, np.nan)
    dx         = 100 * (plus_di - minus_di).abs() / dx_denom
    adx_series = dx.ewm(span=period, adjust=False).mean()
    return adx_series.fillna(0)