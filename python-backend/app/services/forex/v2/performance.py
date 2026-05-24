"""
Performance tracker for forex v2 engine.

Tracks per-strategy win rates across completed trades and adjusts
strategy weights dynamically. Persisted to a JSON file so weights
survive server restarts.

Weight adjustment rule:
  - Win rate > 60%: weight *= 1.1 (capped at 2.0)
  - Win rate < 40%: weight *= 0.9 (floored at 0.3)
  - Insufficient samples (< 10 trades): weight stays at 1.0
"""
import json
import logging
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

PERF_FILE = os.path.join(os.path.dirname(__file__), "_performance.json")

STRATEGY_NAMES = [
    "EMA Crossover",
    "Trend Follow",
    "Breakout",
    "Pullback + MACD",
]


@dataclass
class StrategyStats:
    name: str
    total_trades: int = 0
    wins: int = 0
    losses: int = 0
    total_pnl: float = 0.0
    weight: float = 1.0
    last_updated: str = ""

    @property
    def win_rate(self) -> float:
        if self.total_trades == 0:
            return 0.0
        return self.wins / self.total_trades

    @property
    def avg_pnl(self) -> float:
        if self.total_trades == 0:
            return 0.0
        return self.total_pnl / self.total_trades

    def to_dict(self) -> dict:
        return {
            **asdict(self),
            "win_rate": round(self.win_rate, 3),
            "avg_pnl": round(self.avg_pnl, 4),
        }


class PerformanceTracker:
    """
    Tracks per-strategy performance and adjusts weights.
    Thread-safe for single-process use (FastAPI single worker).
    """

    def __init__(self):
        self.stats: dict[str, StrategyStats] = {
            name: StrategyStats(name=name) for name in STRATEGY_NAMES
        }
        self._load()

    # ── Persistence ───────────────────────────────────────────────────────────

    def _load(self):
        """Load stats from JSON file if it exists."""
        try:
            if os.path.exists(PERF_FILE):
                with open(PERF_FILE, "r") as f:
                    data = json.load(f)
                for name, d in data.items():
                    if name in self.stats:
                        s = self.stats[name]
                        s.total_trades = d.get("total_trades", 0)
                        s.wins         = d.get("wins", 0)
                        s.losses       = d.get("losses", 0)
                        s.total_pnl    = d.get("total_pnl", 0.0)
                        s.weight       = d.get("weight", 1.0)
                        s.last_updated = d.get("last_updated", "")
                logger.info(f"Loaded performance data for {len(data)} strategies")
        except Exception as e:
            logger.warning(f"Could not load performance file: {e} — starting fresh")

    def _save(self):
        """Persist stats to JSON."""
        try:
            data = {name: s.to_dict() for name, s in self.stats.items()}
            with open(PERF_FILE, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning(f"Could not save performance file: {e}")

    # ── Recording trades ──────────────────────────────────────────────────────

    def record_trade(self, strategy_name: str, pnl: float):
        """
        Record a completed trade outcome for a strategy.
        pnl: profit/loss in account currency (positive = win, negative = loss).
        """
        if strategy_name not in self.stats:
            logger.warning(f"Unknown strategy: {strategy_name}")
            return

        s = self.stats[strategy_name]
        s.total_trades += 1
        s.total_pnl    += pnl
        s.last_updated  = datetime.utcnow().isoformat()

        if pnl > 0:
            s.wins += 1
        else:
            s.losses += 1

        self._adjust_weight(s)
        self._save()
        logger.info(f"Recorded trade for {strategy_name}: PnL={pnl:.4f} · Win rate={s.win_rate:.0%}")

    def _adjust_weight(self, s: StrategyStats):
        """Dynamically adjust weight based on recent win rate."""
        if s.total_trades < 10:
            s.weight = 1.0  # insufficient data
            return

        if s.win_rate > 0.60:
            s.weight = min(2.0, s.weight * 1.1)
        elif s.win_rate < 0.40:
            s.weight = max(0.3, s.weight * 0.9)
        # Between 40-60%: no change

    # ── Querying ──────────────────────────────────────────────────────────────

    def get_weights(self) -> dict[str, float]:
        """Return current strategy weights for the engine."""
        return {name: s.weight for name, s in self.stats.items()}

    def get_summary(self) -> list[dict]:
        """Return all strategy stats as a list of dicts."""
        return [s.to_dict() for s in self.stats.values()]

    def reset(self):
        """Reset all stats (for testing)."""
        self.stats = {name: StrategyStats(name=name) for name in STRATEGY_NAMES}
        self._save()


# Module-level singleton — shared across the app
_tracker: Optional[PerformanceTracker] = None


def get_tracker() -> PerformanceTracker:
    global _tracker
    if _tracker is None:
        _tracker = PerformanceTracker()
    return _tracker