"""
Risk management for forex trading.
Controls position sizing, stop loss, take profit, and daily limits.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class RiskConfig:
    # Maximum % of account to risk per trade
    risk_per_trade_pct: float = 1.0       # 1% per trade
    # Maximum % of account in open trades total
    max_exposure_pct: float = 10.0        # 10% total exposure
    # Risk:Reward ratio minimum
    min_rr_ratio: float = 2.0             # minimum 1:2 risk:reward
    # Maximum trades open at once
    max_open_trades: int = 5
    # Maximum daily loss before algo stops trading
    max_daily_loss_pct: float = 3.0       # stop if down 3% in a day
    # Default stop loss in pips
    default_sl_pips: int = 20
    # Default take profit multiplier (sl * multiplier)
    tp_multiplier: float = 2.0
    # Pip values per standard lot for major pairs
    pip_values: dict = None

    def __post_init__(self):
        if self.pip_values is None:
            self.pip_values = {
                "EURUSD": 10.0,
                "GBPUSD": 10.0,
                "USDJPY": 9.1,
                "USDZAR": 10.0,
                "EURZAR": 10.0,
                "XAUUSD": 10.0,
                "GBPZAR": 10.0,
                "AUDUSD": 10.0,
            }


@dataclass
class TradeSetup:
    symbol: str
    direction: str          # BUY | SELL
    entry_price: float
    stop_loss: float
    take_profit: float
    lot_size: float
    risk_amount: float      # ZAR amount at risk
    rr_ratio: float
    strategy: str
    confidence: float       # 0-1 score from signals
    notes: str = ""


def calculate_position_size(
    account_balance: float,
    entry_price: float,
    stop_loss: float,
    symbol: str,
    config: RiskConfig = None,
) -> float:
    """
    Calculate lot size based on account balance and risk %.
    Returns lot size rounded to 2 decimal places.
    """
    if config is None:
        config = RiskConfig()

    risk_amount = account_balance * (config.risk_per_trade_pct / 100)
    sl_pips = abs(entry_price - stop_loss) * (10000 if "JPY" not in symbol else 100)

    if sl_pips == 0:
        return 0.01  # minimum lot

    pip_value = config.pip_values.get(symbol.replace("/", "").replace("_", ""), 10.0)
    lot_size = risk_amount / (sl_pips * pip_value)

    # Clamp between 0.01 (micro) and 1.0 (standard)
    return round(max(0.01, min(1.0, lot_size)), 2)


def calculate_sl_tp(
    entry_price: float,
    direction: str,
    symbol: str,
    atr: float = None,
    config: RiskConfig = None,
) -> tuple[float, float]:
    """
    Calculate stop loss and take profit prices.
    Uses ATR if available, otherwise fixed pips.
    Returns (stop_loss, take_profit).
    """
    if config is None:
        config = RiskConfig()

    is_jpy = "JPY" in symbol
    pip = 0.01 if is_jpy else 0.0001

    if atr:
        # Use 1.5x ATR for SL, 3x ATR for TP
        sl_distance = atr * 1.5
        tp_distance = atr * 1.5 * config.tp_multiplier
    else:
        sl_distance = config.default_sl_pips * pip
        tp_distance = sl_distance * config.tp_multiplier

    if direction == "BUY":
        stop_loss  = round(entry_price - sl_distance, 5)
        take_profit = round(entry_price + tp_distance, 5)
    else:
        stop_loss  = round(entry_price + sl_distance, 5)
        take_profit = round(entry_price - tp_distance, 5)

    return stop_loss, take_profit


def validate_trade(
    setup: TradeSetup,
    open_trades: int,
    daily_pnl_pct: float,
    config: RiskConfig = None,
) -> tuple[bool, str]:
    """
    Final validation before placing a trade.
    Returns (approved, reason).
    """
    if config is None:
        config = RiskConfig()

    if open_trades >= config.max_open_trades:
        return False, f"Max open trades reached ({config.max_open_trades})"

    if daily_pnl_pct <= -config.max_daily_loss_pct:
        return False, f"Daily loss limit hit ({config.max_daily_loss_pct}%)"

    if setup.rr_ratio < config.min_rr_ratio:
        return False, f"RR ratio too low ({setup.rr_ratio:.1f} < {config.min_rr_ratio})"

    if setup.confidence < 0.5:
        return False, f"Signal confidence too low ({setup.confidence:.0%})"

    return True, "Approved"