import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class GoalType(str, enum.Enum):
    SAVINGS = "SAVINGS"
    SPENDING_LIMIT = "SPENDING_LIMIT"
    NET_WORTH = "NET_WORTH"
    TRADE_TARGET = "TRADE_TARGET"
    CUSTOM = "CUSTOM"


class Difficulty(str, enum.Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"


XP_BY_DIFFICULTY = {
    Difficulty.EASY: 90,
    Difficulty.MEDIUM: 175,
    Difficulty.HARD: 300,
}


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[GoalType] = mapped_column(Enum(GoalType), nullable=False)
    difficulty: Mapped[Difficulty] = mapped_column(Enum(Difficulty), default=Difficulty.MEDIUM, nullable=False)
    target_value: Mapped[float] = mapped_column(Float, nullable=False)
    current_value: Mapped[float] = mapped_column(Float, default=0.0)
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="goals")  # type: ignore[name-defined]

    @property
    def xp_reward(self) -> int:
        return XP_BY_DIFFICULTY[self.difficulty]