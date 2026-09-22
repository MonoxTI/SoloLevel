"""
DerivTrader — orchestrates analysis and trade execution on Deriv.

Replaces auto_trader.py (MT5). Uses the same v2 strategy engine
so signal quality is identical — only the broker layer changes.

Key differences from MT5:
- Deriv uses stake-based contracts, not lot sizes
- Contracts have a fixed duration (we use 5 minutes for V25)
- No SL/TP on the contract itself — duration defines the exit
- BUY = CALL (bet price goes up), SELL = PUT (bet price goes down)
"""
import asyncio
import logging
from datetime import datetime, date
from typing import Optional

from app.services.deriv.client import DerivClient
from app.services.deriv.data import fetch_all_timeframes
from app.services.forex.v2.strategies import run_all_strategies
from app.services.forex.v2.risk import RiskConfig
from app.services.forex.v2.performance import get_tracker

logger = logging.getLogger(__name__)

# Default symbols to scan
DEFAULT_SYMBOLS = ["R_25"]  # Volatility 25 Index — expand later


class DerivTrader:
    def __init__(self, client: DerivClient, risk_config: RiskConfig = None):
        self.client = client
        self.risk = risk_config or RiskConfig(
            risk_per_trade_pct=1.0,
            max_open_trades=3,
            max_daily_loss_pct=5.0,
            min_confidence=0.45,
        )
        self.daily_trades    = 0
        self.daily_pnl       = 0.0
        self.trade_log: list[dict] = []
        self._notify: Optional[callable] = None

    def set_notify(self, callback):
        self._notify = callback

    def notify(self, msg: str):
        logger.info(f"[NOTIFY] {msg}")
        if self._notify:
            asyncio.create_task(self._notify(msg))

    # ── Connection ────────────────────────────────────────────────────────────

    async def start(self) -> tuple[bool, str]:
        ok, msg = await self.client.connect()
        if ok:
            self.notify(
                f"🤖 *DerivBot connected*\n"
                f"Account: {self.client.account.login_id}\n"
                f"Type: {self.client.account.account_type}\n"
                f"Balance: {self.client.account.balance} {self.client.account.currency}"
            )
        else:
            self.notify(f"❌ Deriv connection failed: {msg}")
        return ok, msg

    async def stop(self):
        await self.client.disconnect()

    # ── Main scan ─────────────────────────────────────────────────────────────

    async def run_scan(self, symbols: list[str] = None) -> list[dict]:
        """Scan symbols and place trades on valid signals."""
        if not self.client.connected:
            ok, msg = await self.start()
            if not ok:
                return []

        symbols = symbols or DEFAULT_SYMBOLS
        balance = await self.client.get_balance()
        open_positions = await self.client.get_open_contracts()
        open_count = len(open_positions)
        self.daily_pnl = sum(p.profit for p in open_positions)
        daily_pnl_pct = (self.daily_pnl / balance * 100) if balance else 0

        logger.info(
            f"Scan: {len(symbols)} symbols | "
            f"balance={balance} | open={open_count} | daily_pnl={daily_pnl_pct:.2f}%"
        )

        results = []
        for symbol in symbols:
            result = await self._evaluate_symbol(symbol, balance, open_count, daily_pnl_pct)
            if result:
                results.append(result)
                open_count += 1
        return results

    async def _evaluate_symbol(
        self,
        symbol: str,
        balance: float,
        open_count: int,
        daily_pnl_pct: float,
    ) -> Optional[dict]:
        """Analyse symbol and place trade if approved."""

        # Risk guards
        if open_count >= self.risk.max_open_trades:
            logger.info(f"{symbol}: skipped — max open trades ({self.risk.max_open_trades})")
            return None
        if daily_pnl_pct <= -self.risk.max_daily_loss_pct:
            logger.info(f"{symbol}: skipped — daily loss limit hit")
            return None

        # Skip if already have a position on this symbol
        existing = await self.client.get_open_contracts()
        if any(p.symbol == symbol for p in existing):
            logger.debug(f"{symbol}: already have open position")
            return None

        # Fetch data and run strategies
        try:
            dfs = await fetch_all_timeframes(self.client, symbol)
        except Exception as e:
            logger.warning(f"{symbol}: data fetch failed — {e}")
            return None

        tracker = get_tracker()
        weights = tracker.get_weights()
        analysis = run_all_strategies(dfs, weights=weights)

        signal = analysis["final_signal"]
        confidence = analysis["final_confidence"]

        logger.info(
            f"{symbol}: signal={signal} confidence={confidence:.0%} "
            f"agreeing={analysis['agreeing']}/4 score={analysis['score']}"
        )

        if signal not in ("BUY", "SELL"):
            return None
        if confidence < self.risk.min_confidence:
            logger.info(f"{symbol}: confidence {confidence:.0%} below threshold")
            return None

        # Calculate stake (1% of balance per trade)
        stake = round(balance * (self.risk.risk_per_trade_pct / 100), 2)
        stake = max(1.0, stake)  # Deriv minimum stake is $1

        # Get current price for reference
        try:
            tick = await self.client.get_tick(symbol)
            current_price = tick.get("quote", 0)
        except Exception as e:
            logger.warning(f"{symbol}: couldn't get tick — {e}")
            current_price = 0

        # Place the trade — 5 minute duration for V25
        ok, result = await self.client.place_trade(
            symbol=symbol,
            direction=signal,
            stake=stake,
            duration=5,
            duration_unit="m",
        )

        if ok:
            self.daily_trades += 1
            agreeing = [
                name for name, s in analysis["strategies"].items()
                if s["signal"] == signal
            ]
            self.trade_log.append({**result, "analysed_at": datetime.utcnow().isoformat()})

            self.notify(
                f"✅ *Trade placed on Deriv*\n"
                f"Symbol: *{symbol}* (Volatility 25)\n"
                f"Direction: *{signal}*\n"
                f"Stake: ${stake}\n"
                f"Entry: {current_price}\n"
                f"Duration: 5 minutes\n"
                f"Strategies: {', '.join(agreeing)}\n"
                f"Confidence: {confidence:.0%}\n"
                f"Contract ID: {result.get('contract_id', '?')}"
            )
            return result
        else:
            logger.warning(f"{symbol}: trade failed — {result.get('error')}")
            self.notify(f"⚠️ Trade failed on {symbol}: {result.get('error')}")
            return None

    # ── Daily summary ─────────────────────────────────────────────────────────

    async def send_daily_summary(self):
        if not self.client.connected:
            return
        balance = await self.client.get_balance()
        positions = await self.client.get_open_contracts()
        recent = await self.client.get_profit_table(limit=5)
        total_pnl = sum(p.profit for p in positions)

        lines = [
            "📊 *Daily Trading Summary*",
            f"Date: {date.today().strftime('%d %b %Y')}",
            f"",
            f"Balance: ${balance:,.2f}",
            f"Open P&L: {'+'if total_pnl>=0 else ''}${total_pnl:,.2f}",
            f"Open trades: {len(positions)}",
            f"Trades today: {self.daily_trades}",
        ]
        if recent:
            lines.append("\n*Recent closed trades:*")
            for t in recent[:3]:
                pnl = t.get("profit", 0)
                lines.append(f"  {'+' if pnl>=0 else ''}${pnl:.2f} — {t.get('contract_type','')} {t.get('symbol','')}")

        self.notify("\n".join(lines))

    async def send_morning_briefing(self):
        if not self.client.connected:
            return
        balance = await self.client.get_balance()
        self.notify(
            f"☀️ *Morning briefing*\n"
            f"Balance: ${balance:,.2f}\n"
            f"Scanning {len(DEFAULT_SYMBOLS)} symbols...\n"
            f"Risk per trade: {self.risk.risk_per_trade_pct}%\n"
            f"Max daily loss: {self.risk.max_daily_loss_pct}%"
        )
        await self.run_scan()