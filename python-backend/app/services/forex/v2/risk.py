"""
Risk management for forex v2 engine.
Extends v1 with volatility-adjusted sizing and multi-layer validation.
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class RiskConfig:
    risk_per_trade_pct: float = 1.0       # % of balance to risk per trade
    max_exposure_pct: float = 10.0        # max % in open trades total
    min_rr_ratio: float = 2.0             # minimum reward:risk
    max_open_trades: int = 5
    max_daily_loss_pct: float = 3.0
    sl_atr_multiplier: float = 1.5        # SL = entry ± (ATR × this)
    tp_atr_multiplier: float = 3.0        # TP = entry ± (ATR × this)
    min_confidence: float = 0.55          # minimum strategy confidence to trade
    pip_values: dict = field(default_factory=dict)

    def __post_init__(self):
        if not self.pip_values:
            self.pip_values = {
                "EURUSD": 10.0,
                "GBPUSD": 10.0,
                "USDJPY": 9.1,
                "USDZAR": 10.0,
                "EURZAR": 10.0,
                "XAUUSD": 1.0,   # gold: $1 per 0.01 lot per $1 move
                "GBPZAR": 10.0,
                "AUDUSD": 10.0,
                "USDCAD": 10.0,
                "NZDUSD": 10.0,
            }


@dataclass
class TradeSetup:
    symbol: str
    direction: str       # BUY | SELL
    entry_price: float
    stop_loss: float
    take_profit: float
    lot_size: float
    risk_amount: float   # dollar/ZAR amount at risk
    rr_ratio: float
    strategy: str
    confidence: float
    atr: float = 0.0
    notes: str = ""


def calculate_sl_tp(
    entry_price: float,
    direction: str,
    symbol: str,
    atr_val: float,
    config: RiskConfig,
) -> tuple[float, float]:
    """
    Calculate SL and TP using ATR-based distances.
    Returns (stop_loss, take_profit).
    """
    sl_dist = atr_val * config.sl_atr_multiplier
    tp_dist = atr_val * config.tp_atr_multiplier

    if direction == "BUY":
        stop_loss   = entry_price - sl_dist
        take_profit = entry_price + tp_dist
    else:
        stop_loss   = entry_price + sl_dist
        take_profit = entry_price - tp_dist

    decimals = 2 if "JPY" in symbol or "XAU" in symbol else 5
    return round(stop_loss, decimals), round(take_profit, decimals)


def calculate_position_size(
    account_balance: float,
    entry_price: float,
    stop_loss: float,
    symbol: str,
    config: RiskConfig,
) -> float:
    """
    Position size based on fixed fractional risk.
    Clamps between 0.01 (micro) and 2.0 (double standard lot).
    """
    risk_amount = account_balance * (config.risk_per_trade_pct / 100)
    is_jpy = "JPY" in symbol
    pip_multiplier = 100 if is_jpy else 10000
    sl_pips = abs(entry_price - stop_loss) * pip_multiplier

    if sl_pips < 0.01:
        return 0.01

    pip_value = config.pip_values.get(symbol, 10.0)
    lot_size  = risk_amount / (sl_pips * pip_value)
    return round(max(0.01, min(2.0, lot_size)), 2)


def build_trade_setup(
    symbol: str,
    direction: str,
    entry_price: float,
    atr_val: float,
    confidence: float,
    strategy_name: str,
    account_balance: float,
    config: RiskConfig,
) -> TradeSetup:
    """Build a complete TradeSetup from analysis output."""
    sl, tp = calculate_sl_tp(entry_price, direction, symbol, atr_val, config)
    lot    = calculate_position_size(account_balance, entry_price, sl, symbol, config)

    sl_dist = abs(entry_price - sl)
    tp_dist = abs(entry_price - tp)
    rr      = round(tp_dist / sl_dist, 2) if sl_dist > 0 else 0

    risk_amt = account_balance * (config.risk_per_trade_pct / 100)

    return TradeSetup(
        symbol=symbol,
        direction=direction,
        entry_price=round(entry_price, 5),
        stop_loss=sl,
        take_profit=tp,
        lot_size=lot,
        risk_amount=round(risk_amt, 2),
        rr_ratio=rr,
        strategy=strategy_name,
        confidence=confidence,
        atr=round(atr_val, 5),
    )


def validate_trade(
    setup: TradeSetup,
    open_trades: int,
    daily_pnl_pct: float,
    config: RiskConfig,
) -> tuple[bool, str]:
    """
    Multi-layer pre-trade validation.
    Returns (approved: bool, reason: str).
    """
    if open_trades >= config.max_open_trades:
        return False, f"Max open trades reached ({config.max_open_trades})"

    if daily_pnl_pct <= -config.max_daily_loss_pct:
        return False, f"Daily loss limit hit ({config.max_daily_loss_pct:.1f}%)"

    if setup.rr_ratio < config.min_rr_ratio:
        return False, f"RR {setup.rr_ratio:.1f} below minimum {config.min_rr_ratio}"

    if setup.confidence < config.min_confidence:
        return False, f"Confidence {setup.confidence:.0%} below threshold {config.min_confidence:.0%}"

    if setup.lot_size <= 0:
        return False, "Lot size calculation failed"

    return True, "Approved"