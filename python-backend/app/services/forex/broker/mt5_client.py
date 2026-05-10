"""
MetaTrader 5 broker client.
Handles connection, price fetching, order placement, and position management.
MT5 Python library only works on Windows.
"""
import logging
from datetime import datetime
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# MT5 constants (mirrors the MT5 library values so we can import without MT5 installed)
ORDER_TYPE_BUY  = 0
ORDER_TYPE_SELL = 1
TRADE_ACTION_DEAL    = 1
TRADE_ACTION_SLTP    = 6
ORDER_FILLING_IOC    = 1
ORDER_FILLING_FOK    = 0

# Map our pair names to MT5 symbols
SYMBOL_MAP = {
    "EURUSD": "EURUSD",
    "GBPUSD": "GBPUSD",
    "USDJPY": "USDJPY",
    "USDZAR": "USDZAR",
    "EURZAR": "EURZAR",
    "GBPZAR": "GBPZAR",
    "XAUUSD": "XAUUSD",  # Gold
    "AUDUSD": "AUDUSD",
}


@dataclass
class MT5Config:
    login: int          # MT5 account number
    password: str       # MT5 account password
    server: str         # Broker server e.g. "ICMarkets-Demo"
    path: str = ""      # MT5 terminal path (optional — auto-detected if empty)


@dataclass
class MT5Trade:
    ticket: int
    symbol: str
    direction: str      # BUY | SELL
    volume: float
    open_price: float
    sl: float
    tp: float
    profit: float
    open_time: datetime
    comment: str = ""


class MT5Client:
    """
    Wrapper around MetaTrader5 Python library.
    All methods return clean dicts so the rest of the app
    doesn't need to import MT5 directly.
    """

    def __init__(self, config: MT5Config):
        self.config = config
        self._connected = False
        self._mt5 = None

    def connect(self) -> tuple[bool, str]:
        """Initialize and log into MT5. Returns (success, message)."""
        try:
            import MetaTrader5 as mt5
            self._mt5 = mt5

            # Initialize MT5 terminal
            if self.config.path:
                ok = mt5.initialize(self.config.path)
            else:
                ok = mt5.initialize()

            if not ok:
                err = mt5.last_error()
                return False, f"MT5 init failed: {err}"

            # Login
            ok = mt5.login(
                login=self.config.login,
                password=self.config.password,
                server=self.config.server,
            )
            if not ok:
                err = mt5.last_error()
                mt5.shutdown()
                return False, f"MT5 login failed: {err}"

            self._connected = True
            info = mt5.account_info()
            return True, f"Connected to {info.server} — Balance: {info.balance} {info.currency}"

        except ImportError:
            return False, "MetaTrader5 library not installed. Run: pip install MetaTrader5"
        except Exception as e:
            return False, f"MT5 connection error: {e}"

    def disconnect(self):
        if self._mt5 and self._connected:
            self._mt5.shutdown()
            self._connected = False

    def get_account_info(self) -> dict:
        if not self._connected:
            return {"error": "Not connected"}
        info = self._mt5.account_info()
        return {
            "balance": info.balance,
            "equity": info.equity,
            "margin": info.margin,
            "free_margin": info.margin_free,
            "profit": info.profit,
            "currency": info.currency,
            "leverage": info.leverage,
            "server": info.server,
        }

    def get_price(self, symbol: str) -> Optional[dict]:
        """Get current bid/ask for a symbol."""
        if not self._connected:
            return None
        mt5_symbol = SYMBOL_MAP.get(symbol, symbol)
        tick = self._mt5.symbol_info_tick(mt5_symbol)
        if tick is None:
            return None
        return {
            "symbol": symbol,
            "bid": tick.bid,
            "ask": tick.ask,
            "spread": round(tick.ask - tick.bid, 5),
            "time": datetime.fromtimestamp(tick.time),
        }

    def get_symbol_info(self, symbol: str) -> Optional[dict]:
        """Get symbol specifications — min lot, lot step, digits."""
        if not self._connected:
            return None
        mt5_symbol = SYMBOL_MAP.get(symbol, symbol)
        info = self._mt5.symbol_info(mt5_symbol)
        if info is None:
            return None
        return {
            "symbol": symbol,
            "min_lot": info.volume_min,
            "max_lot": info.volume_max,
            "lot_step": info.volume_step,
            "digits": info.digits,
            "spread": info.spread,
            "trade_allowed": info.trade_mode != 0,
        }

    def place_order(
        self,
        symbol: str,
        direction: str,         # BUY | SELL
        lot_size: float,
        stop_loss: float,
        take_profit: float,
        comment: str = "MonoxBot",
    ) -> tuple[bool, dict]:
        """
        Place a market order.
        Returns (success, result_dict).
        """
        if not self._connected:
            return False, {"error": "Not connected to MT5"}

        mt5_symbol = SYMBOL_MAP.get(symbol, symbol)

        # Ensure symbol is selected in market watch
        self._mt5.symbol_select(mt5_symbol, True)

        tick = self._mt5.symbol_info_tick(mt5_symbol)
        if tick is None:
            return False, {"error": f"Cannot get price for {symbol}"}

        order_type = ORDER_TYPE_BUY if direction == "BUY" else ORDER_TYPE_SELL
        price = tick.ask if direction == "BUY" else tick.bid

        # Validate lot size against broker minimums
        sym_info = self._mt5.symbol_info(mt5_symbol)
        lot_size = max(sym_info.volume_min, round(lot_size / sym_info.volume_step) * sym_info.volume_step)

        request = {
            "action":      TRADE_ACTION_DEAL,
            "symbol":      mt5_symbol,
            "volume":      lot_size,
            "type":        order_type,
            "price":       price,
            "sl":          round(stop_loss, sym_info.digits),
            "tp":          round(take_profit, sym_info.digits),
            "deviation":   20,          # max slippage in points
            "magic":       20250001,    # unique EA identifier
            "comment":     comment,
            "type_filling": ORDER_FILLING_IOC,
        }

        result = self._mt5.order_send(request)

        if result.retcode == self._mt5.TRADE_RETCODE_DONE:
            return True, {
                "ticket":      result.order,
                "symbol":      symbol,
                "direction":   direction,
                "volume":      lot_size,
                "price":       result.price,
                "sl":          stop_loss,
                "tp":          take_profit,
                "comment":     comment,
                "retcode":     result.retcode,
            }
        else:
            return False, {
                "error":   f"Order failed: retcode={result.retcode} comment={result.comment}",
                "retcode": result.retcode,
            }

    def get_open_positions(self) -> list[MT5Trade]:
        """Return all open positions placed by MonoxBot."""
        if not self._connected:
            return []
        positions = self._mt5.positions_get(magic=20250001)
        if positions is None:
            return []
        return [
            MT5Trade(
                ticket=p.ticket,
                symbol=p.symbol,
                direction="BUY" if p.type == ORDER_TYPE_BUY else "SELL",
                volume=p.volume,
                open_price=p.price_open,
                sl=p.sl,
                tp=p.tp,
                profit=p.profit,
                open_time=datetime.fromtimestamp(p.time),
                comment=p.comment,
            )
            for p in positions
        ]

    def close_position(self, ticket: int) -> tuple[bool, str]:
        """Close a position by ticket number."""
        if not self._connected:
            return False, "Not connected"

        positions = self._mt5.positions_get(ticket=ticket)
        if not positions:
            return False, f"Position {ticket} not found"

        pos = positions[0]
        close_type = ORDER_TYPE_SELL if pos.type == ORDER_TYPE_BUY else ORDER_TYPE_BUY
        tick = self._mt5.symbol_info_tick(pos.symbol)
        price = tick.bid if pos.type == ORDER_TYPE_BUY else tick.ask

        request = {
            "action":    TRADE_ACTION_DEAL,
            "symbol":    pos.symbol,
            "volume":    pos.volume,
            "type":      close_type,
            "position":  ticket,
            "price":     price,
            "deviation": 20,
            "magic":     20250001,
            "comment":   "MonoxBot close",
            "type_filling": ORDER_FILLING_IOC,
        }

        result = self._mt5.order_send(request)
        if result.retcode == self._mt5.TRADE_RETCODE_DONE:
            return True, f"Position {ticket} closed at {price}"
        return False, f"Close failed: retcode={result.retcode}"

    def update_sl_tp(self, ticket: int, sl: float, tp: float) -> tuple[bool, str]:
        """Modify SL/TP on an existing position (trailing stop logic)."""
        if not self._connected:
            return False, "Not connected"

        request = {
            "action":   TRADE_ACTION_SLTP,
            "position": ticket,
            "sl":       sl,
            "tp":       tp,
        }
        result = self._mt5.order_send(request)
        if result.retcode == self._mt5.TRADE_RETCODE_DONE:
            return True, f"SL/TP updated on {ticket}"
        return False, f"Update failed: retcode={result.retcode}"

    @property
    def connected(self) -> bool:
        return self._connected