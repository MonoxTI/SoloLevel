import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class NetWorthSnapshot(Base):
    """
    Manual net worth entry. Updated whenever user logs income/expense.
    One active record per user at a time.
    """
    __tablename__ = "net_worth_snapshots"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    # Base value set manually by user
    base_value: Mapped[float] = mapped_column(Float, default=0.0)
    # Auto-adjusted: base + all income - all expenses since base was set
    current_value: Mapped[float] = mapped_column(Float, default=0.0)
    # Yearly savings budget goal e.g. R10,000
    yearly_budget_goal: Mapped[float] = mapped_column(Float, default=10000.0)
    # How much saved toward that goal this year
    saved_this_year: Mapped[float] = mapped_column(Float, default=0.0)
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="net_worth")  # type: ignore[name-defined]


class PortfolioTrade(Base):
    """Individual trade placed by the algo or manually."""
    __tablename__ = "portfolio_trades"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String, nullable=False)     # e.g. NPN.JO
    side: Mapped[str] = mapped_column(String, nullable=False)        # BUY | SELL
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    current_price: Mapped[float] = mapped_column(Float, default=0.0)
    exit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="OPEN")      # OPEN | CLOSED
    pnl: Mapped[float] = mapped_column(Float, default=0.0)
    is_paper: Mapped[bool] = mapped_column(Boolean, default=True)    # paper trade by default
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="trades")  # type: ignore[name-defined]