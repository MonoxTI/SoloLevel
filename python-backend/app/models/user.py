import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    xp: Mapped[int] = mapped_column(Integer, default=0)
    level: Mapped[int] = mapped_column(Integer, default=1)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    last_active: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    transactions: Mapped[list["Transaction"]] = relationship(  # type: ignore[name-defined]
        back_populates="user", cascade="all, delete"
    )
    goals: Mapped[list["Goal"]] = relationship(  # type: ignore[name-defined]
        back_populates="user", cascade="all, delete"
    )
    daily_logs: Mapped[list["DailyGoalLog"]] = relationship(  # type: ignore[name-defined]
        back_populates="user", cascade="all, delete"
    )
    net_worth: Mapped[list["NetWorthSnapshot"]] = relationship(  # type: ignore[name-defined]
        back_populates="user", cascade="all, delete"
    )
    trades: Mapped[list["PortfolioTrade"]] = relationship(  # type: ignore[name-defined]
        back_populates="user", cascade="all, delete"
    )