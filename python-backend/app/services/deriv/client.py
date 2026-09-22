"""
Deriv WebSocket API client.

Handles connection, authentication, tick subscriptions, and order placement
for the Deriv trading platform. Uses websockets library for async WS.

Volatility indices (synthetic indices) are available 24/7 — no market hours.
Symbol: R_25 = Volatility 25 Index
"""
import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Optional, Callable
import websockets

logger = logging.getLogger(__name__)

DERIV_WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089"

# Deriv synthetic index symbols
SYNTHETIC_SYMBOLS = {
    "R_10":  "Volatility 10 Index",
    "R_25":  "Volatility 25 Index",
    "R_50":  "Volatility 50 Index",
    "R_75":  "Volatility 75 Index",
    "R_100": "Volatility 100 Index",
}


@dataclass
class DerivPosition:
    contract_id: int
    symbol: str
    direction: str        # BUY | SELL (mapped from CALL/PUT)
    stake: float
    entry_price: float
    current_price: float
    profit: float
    expiry: str
    status: str           # open | closed | sold


@dataclass
class DerivAccount:
    balance: float
    currency: str
    login_id: str
    account_type: str
    is_virtual: bool


class DerivClient:
    def __init__(self, api_token: str):
        self.api_token = api_token
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.connected = False
        self.authorized = False
        self._req_id = 0
        self._pending: dict[int, asyncio.Future] = {}
        self._tick_callbacks: dict[str, list[Callable]] = {}
        self._listen_task: Optional[asyncio.Task] = None
        self.account: Optional[DerivAccount] = None

    # ── Connection ────────────────────────────────────────────────────────────

    async def connect(self) -> tuple[bool, str]:
        """Connect and authenticate with Deriv API."""
        try:
            self.ws = await websockets.connect(
                DERIV_WS_URL,
                ping_interval=30,
                ping_timeout=10,
            )
            self.connected = True
            self._listen_task = asyncio.create_task(self._listen())
            logger.info("WebSocket connected to Deriv")

            # Authenticate
            resp = await self._send({"authorize": self.api_token})
            if "error" in resp:
                return False, f"Auth failed: {resp['error']['message']}"

            auth = resp["authorize"]
            self.authorized = True
            self.account = DerivAccount(
                balance=auth.get("balance", 0),
                currency=auth.get("currency", "USD"),
                login_id=auth.get("loginid", ""),
                account_type="virtual" if auth.get("is_virtual") else "real",
                is_virtual=bool(auth.get("is_virtual")),
            )
            logger.info(f"Authorized: {self.account.login_id} ({self.account.account_type}) "
                        f"balance={self.account.balance} {self.account.currency}")
            return True, f"Connected as {self.account.login_id}"

        except Exception as e:
            self.connected = False
            return False, str(e)

    async def disconnect(self):
        if self._listen_task:
            self._listen_task.cancel()
        if self.ws:
            await self.ws.close()
        self.connected = False
        self.authorized = False
        logger.info("Disconnected from Deriv")

    # ── Messaging ─────────────────────────────────────────────────────────────

    def _next_id(self) -> int:
        self._req_id += 1
        return self._req_id

    async def _send(self, payload: dict, timeout: float = 15.0) -> dict:
        """Send a request and wait for its response."""
        req_id = self._next_id()
        payload["req_id"] = req_id
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[req_id] = future
        await self.ws.send(json.dumps(payload))
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending.pop(req_id, None)
            raise TimeoutError(f"Deriv API timeout for {list(payload.keys())[0]}")

    async def _listen(self):
        """Background listener — routes responses to pending futures or tick callbacks."""
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                req_id = msg.get("req_id")

                # Route to pending request
                if req_id and req_id in self._pending:
                    self._pending.pop(req_id).set_result(msg)
                    continue

                # Route tick updates
                msg_type = msg.get("msg_type")
                if msg_type == "tick":
                    symbol = msg["tick"]["symbol"]
                    for cb in self._tick_callbacks.get(symbol, []):
                        try:
                            cb(msg["tick"])
                        except Exception as e:
                            logger.warning(f"Tick callback error: {e}")
                elif msg_type == "ohlc":
                    pass  # handled separately if needed

        except websockets.exceptions.ConnectionClosed:
            logger.warning("Deriv WebSocket closed")
            self.connected = False

    # ── Market data ───────────────────────────────────────────────────────────

    async def get_tick(self, symbol: str) -> dict:
        """Get the latest tick (current price) for a symbol."""
        resp = await self._send({"ticks": symbol, "subscribe": 0})
        if "error" in resp:
            raise ValueError(resp["error"]["message"])
        return resp["tick"]

    async def get_candles(self, symbol: str, granularity: int = 3600, count: int = 500) -> list[dict]:
        """
        Fetch historical OHLC candles.
        granularity: seconds per candle (3600=1h, 14400=4h, 86400=1d)
        """
        resp = await self._send({
            "ticks_history": symbol,
            "adjust_start_time": 1,
            "count": count,
            "end": "latest",
            "granularity": granularity,
            "style": "candles",
        })
        if "error" in resp:
            raise ValueError(resp["error"]["message"])
        return resp.get("candles", [])

    def subscribe_ticks(self, symbol: str, callback: Callable):
        """Subscribe to live tick updates for a symbol."""
        if symbol not in self._tick_callbacks:
            self._tick_callbacks[symbol] = []
            asyncio.create_task(self._subscribe_ticks(symbol))
        self._tick_callbacks[symbol].append(callback)

    async def _subscribe_ticks(self, symbol: str):
        await self._send({"ticks": symbol, "subscribe": 1})

    # ── Account ───────────────────────────────────────────────────────────────

    async def get_balance(self) -> float:
        """Get current account balance."""
        resp = await self._send({"balance": 1, "subscribe": 0})
        if "error" in resp:
            raise ValueError(resp["error"]["message"])
        balance = resp["balance"]["balance"]
        if self.account:
            self.account.balance = balance
        return balance

    async def get_open_contracts(self) -> list[DerivPosition]:
        """Get all open contracts (positions)."""
        resp = await self._send({"portfolio": 1})
        if "error" in resp:
            return []
        positions = []
        for c in resp.get("portfolio", {}).get("contracts", []):
            positions.append(DerivPosition(
                contract_id=c["contract_id"],
                symbol=c["symbol"],
                direction="BUY" if c["contract_type"] in ("CALL", "CALLE") else "SELL",
                stake=c.get("buy_price", 0),
                entry_price=c.get("purchase_price", 0),
                current_price=c.get("bid_price", 0),
                profit=c.get("profit", 0),
                expiry=c.get("expiry_time", ""),
                status="open",
            ))
        return positions

    async def get_profit_table(self, limit: int = 10) -> list[dict]:
        """Get recent closed trades."""
        resp = await self._send({
            "profit_table": 1,
            "description": 1,
            "limit": limit,
            "sort": "DESC",
        })
        if "error" in resp:
            return []
        return resp.get("profit_table", {}).get("transactions", [])

    # ── Trading ───────────────────────────────────────────────────────────────

    async def place_trade(
        self,
        symbol: str,
        direction: str,          # BUY | SELL
        stake: float,            # amount to risk in account currency
        duration: int = 5,       # contract duration
        duration_unit: str = "m", # t=ticks, s=seconds, m=minutes, h=hours, d=days
        barrier: Optional[str] = None,
    ) -> tuple[bool, dict]:
        """
        Place a trade on Deriv.

        For synthetic indices:
          direction BUY  → contract_type CALL (price goes up)
          direction SELL → contract_type PUT  (price goes down)

        Returns (success, result_dict)
        """
        contract_type = "CALL" if direction == "BUY" else "PUT"

        proposal_payload = {
            "proposal": 1,
            "amount": stake,
            "basis": "stake",
            "contract_type": contract_type,
            "currency": self.account.currency if self.account else "USD",
            "duration": duration,
            "duration_unit": duration_unit,
            "symbol": symbol,
        }
        if barrier:
            proposal_payload["barrier"] = barrier

        try:
            proposal = await self._send(proposal_payload)
            if "error" in proposal:
                return False, {"error": proposal["error"]["message"]}

            proposal_id = proposal["proposal"]["id"]
            payout = proposal["proposal"]["payout"]
            ask_price = proposal["proposal"]["ask_price"]

            # Buy the contract
            buy_resp = await self._send({
                "buy": proposal_id,
                "price": ask_price,
            })

            if "error" in buy_resp:
                return False, {"error": buy_resp["error"]["message"]}

            contract = buy_resp["buy"]
            logger.info(
                f"Trade placed: {direction} {symbol} "
                f"stake={stake} contract_id={contract['contract_id']}"
            )
            return True, {
                "contract_id":    contract["contract_id"],
                "symbol":         symbol,
                "direction":      direction,
                "contract_type":  contract_type,
                "stake":          stake,
                "payout":         payout,
                "entry_price":    contract.get("start_spot", 0),
                "transaction_id": contract.get("transaction_id", 0),
            }

        except Exception as e:
            logger.error(f"Trade placement error: {e}")
            return False, {"error": str(e)}

    async def sell_contract(self, contract_id: int, price: float = 0) -> tuple[bool, dict]:
        """Close an open contract early."""
        resp = await self._send({"sell": contract_id, "price": price})
        if "error" in resp:
            return False, {"error": resp["error"]["message"]}
        return True, resp.get("sell", {})