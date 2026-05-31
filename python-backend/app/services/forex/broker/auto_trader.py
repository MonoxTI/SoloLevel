"""
Auto trader — the main loop that runs on a schedule.
Scans pairs, evaluates signals, applies risk checks, and places trades via MT5.
Also handles trailing stops and end-of-day cleanup.
"""
import logging
from datetime import datetime, date
from typing import Optional

from app.services.forex.v2.engine import analyse_pair_v2 as analyse_pair, DEFAULT_PAIRS
from app.services.forex.v2.risk import RiskConfig, validate_trade, TradeSetup, calculate_sl_tp, calculate_position_size
from app.services.forex.broker.mt5_client import MT5Client, MT5Config

logger = logging.getLogger(__name__)


class AutoTrader:
    def __init__(self, mt5_config: MT5Config, risk_config: RiskConfig = None):
        self.client = MT5Client(mt5_config)
        self.risk   = risk_config or RiskConfig()
        self.daily_pnl    = 0.0
        self.daily_trades = 0
        self.trade_log: list[dict] = []
        self._notify_callback = None

    def set_notify(self, callback):
        self._notify_callback = callback

    def notify(self, msg: str):
        logger.info(msg)
        if self._notify_callback:
            self._notify_callback(msg)

    # ── Connection ────────────────────────────────────────────────────────────
    def start(self) -> tuple[bool, str]:
        ok, msg = self.client.connect()
        if ok:
            self.notify(f"🤖 MonoxBot connected to MT5\n{msg}")
        else:
            self.notify(f"❌ MT5 connection failed: {msg}")
        return ok, msg

    def stop(self):
        self.client.disconnect()
        self.notify("🔌 MonoxBot disconnected from MT5")

    # ── Main scan loop ────────────────────────────────────────────────────────
    def run_scan(self, pairs: list[str] = None) -> list[dict]:
        if not self.client.connected:
            ok, msg = self.start()
            if not ok:
                return []

        pairs = pairs or DEFAULT_PAIRS
        account = self.client.get_account_info()
        if "error" in account:
            self.notify(f"⚠️ Cannot get account info: {account['error']}")
            return []

        balance        = account["balance"]
        open_positions = self.client.get_open_positions()
        open_count     = len(open_positions)

        self.daily_pnl = sum(p.profit for p in open_positions)
        daily_pnl_pct  = (self.daily_pnl / balance) * 100 if balance else 0

        logger.info(f"Scanning {len(pairs)} pairs | balance={balance} | open={open_count} | daily_pnl={daily_pnl_pct:.2f}%")

        results = []
        for pair in pairs:
            result = self._evaluate_pair(pair, balance, open_count, daily_pnl_pct)
            if result:
                results.append(result)
                open_count += 1

        return results

    def _evaluate_pair(
        self,
        symbol: str,
        balance: float,
        open_count: int,
        daily_pnl_pct: float,
    ) -> Optional[dict]:
        """Analyse a pair and place a trade if approved."""

        # Skip if already have a position in this pair
        existing = self.client.get_open_positions()
        if any(p.symbol == symbol or p.symbol == symbol.replace("/", "") for p in existing):
            logger.debug(f"{symbol}: skipped — already have open position")
            return None

        analysis = analyse_pair(symbol, balance, open_count, daily_pnl_pct, self.risk)

        if analysis.get("error"):
            logger.warning(f"{symbol}: analysis error — {analysis['error']}")
            return None

        signal = analysis.get("signal")
        logger.info(f"{symbol}: signal={signal} confidence={analysis.get('confidence', 0):.0%} agreeing={analysis.get('agreeing_strategies', 0)}/4")

        if signal not in ("BUY", "SELL"):
            return None

        trade_setup = analysis.get("trade_setup")
        risk_check  = analysis.get("risk_check")

        if not trade_setup:
            logger.warning(f"{symbol}: no trade_setup returned despite {signal} signal")
            return None

        if not risk_check:
            logger.warning(f"{symbol}: no risk_check returned")
            return None

        if not risk_check["approved"]:
            logger.info(f"{symbol}: risk check rejected — {risk_check['reason']}")
            return None

        # Get live price from MT5 (more accurate than yfinance for entry)
        price_info = self.client.get_price(symbol)
        if not price_info:
            logger.warning(f"{symbol}: could not get live price from MT5")
            return None

        live_price = price_info["ask"] if signal == "BUY" else price_info["bid"]

        # ATR from analysis — fall back to 0.001 if missing to avoid crash
        atr_val = analysis.get("atr") or 0.001

        # Recalculate SL/TP using live price (fixes keyword arg bug: atr_val not atr)
        sl, tp = calculate_sl_tp(
            entry_price=live_price,
            direction=signal,
            symbol=symbol,
            atr_val=atr_val,        # ← correct kwarg name
            config=self.risk,
        )

        lot_size = calculate_position_size(
            account_balance=balance,
            entry_price=live_price,
            stop_loss=sl,
            symbol=symbol,
            config=self.risk,
        )

        # Build strategy names string safely
        # strategies dict shape: { "EMA Crossover": { "signal": "BUY", ... }, ... }
        agreeing_strategies = [
            name for name, s in analysis.get("strategies", {}).items()
            if s.get("signal") == signal
        ]
        strategies_str = ", ".join(agreeing_strategies) if agreeing_strategies else "v2 engine"

        logger.info(f"{symbol}: placing {signal} | entry={live_price} SL={sl} TP={tp} lots={lot_size}")

        ok, result = self.client.place_order(
            symbol=symbol,
            direction=signal,
            lot_size=lot_size,
            stop_loss=sl,
            take_profit=tp,
            comment=f"MonoxBot·{signal}·{analysis['confidence']:.0%}",
        )

        if ok:
            self.daily_trades += 1
            self.notify(
                f"✅ *Trade placed*\n"
                f"Pair: *{symbol}*\n"
                f"Direction: *{signal}*\n"
                f"Entry: {live_price}\n"
                f"SL: {sl}  ·  TP: {tp}\n"
                f"Lots: {lot_size}  ·  Risk: R{trade_setup['risk_amount']}\n"
                f"Strategies: {strategies_str}\n"
                f"Confidence: {analysis['confidence']:.0%}"
            )
            self.trade_log.append({**result, "symbol": symbol, "analysed_at": datetime.utcnow().isoformat()})
            return result
        else:
            logger.warning(f"{symbol}: order failed — {result.get('error')}")
            self.notify(f"⚠️ Trade failed on {symbol}: {result.get('error')}")
            return None

    # ── Trailing stop management ──────────────────────────────────────────────
    def update_trailing_stops(self, trail_pct: float = 0.5):
        if not self.client.connected:
            return

        positions = self.client.get_open_positions()
        for pos in positions:
            price_info = self.client.get_price(pos.symbol)
            if not price_info:
                continue

            current = price_info["bid"] if pos.direction == "BUY" else price_info["ask"]

            if pos.direction == "BUY" and current > pos.open_price:
                new_sl = pos.open_price + (current - pos.open_price) * trail_pct
                if new_sl > pos.sl + 0.0001:
                    self.client.update_sl_tp(pos.ticket, sl=new_sl, tp=pos.tp)
                    logger.debug(f"Trailing stop updated {pos.symbol}: {pos.sl:.5f} → {new_sl:.5f}")

            elif pos.direction == "SELL" and current < pos.open_price:
                new_sl = pos.open_price - (pos.open_price - current) * trail_pct
                if new_sl < pos.sl - 0.0001:
                    self.client.update_sl_tp(pos.ticket, sl=new_sl, tp=pos.tp)
                    logger.debug(f"Trailing stop updated {pos.symbol}: {pos.sl:.5f} → {new_sl:.5f}")

    # ── Daily summary ─────────────────────────────────────────────────────────
    def send_daily_summary(self):
        if not self.client.connected:
            return

        account   = self.client.get_account_info()
        positions = self.client.get_open_positions()

        pnl     = account.get("profit", 0)
        balance = account.get("balance", 0)
        pnl_pct = (pnl / balance * 100) if balance else 0

        lines = [
            f"📊 *Daily Trading Summary*",
            f"Date: {date.today().strftime('%d %b %Y')}",
            f"",
            f"Balance: R{balance:,.0f}",
            f"Open P&L: {'+'if pnl>=0 else ''}R{pnl:,.0f} ({pnl_pct:+.2f}%)",
            f"Open trades: {len(positions)}",
            f"Trades today: {self.daily_trades}",
        ]

        if positions:
            lines.append("\n*Open positions:*")
            for p in positions:
                lines.append(f"  {p.direction} {p.symbol} | P&L: {'+'if p.profit>=0 else ''}R{p.profit:.0f}")

        self.notify("\n".join(lines))

    # ── Morning briefing ──────────────────────────────────────────────────────
    def send_morning_briefing(self):
        if not self.client.connected:
            return
        account = self.client.get_account_info()
        balance = account.get("balance", 0)
        self.notify(
            f"☀️ *Morning briefing*\n"
            f"Balance: R{balance:,.0f}\n"
            f"Scanning {len(DEFAULT_PAIRS)} pairs for setups...\n"
            f"Risk per trade: {self.risk.risk_per_trade_pct}%\n"
            f"Max daily loss: {self.risk.max_daily_loss_pct}%"
        )
        self.run_scan()