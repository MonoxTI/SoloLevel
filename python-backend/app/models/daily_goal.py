import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


# The fixed daily goals — same every day
DAILY_GOALS = [
    {"key": "read_book",      "title": "Read book 1h",      "xp_gain": 30,  "xp_loss": 10},
    {"key": "gym",            "title": "Go to gym",          "xp_gain": 40,  "xp_loss": 15},
    {"key": "practice_code",  "title": "Practice code",      "xp_gain": 35,  "xp_loss": 10},
    {"key": "practice_maths", "title": "Practice maths",     "xp_gain": 35,  "xp_loss": 10},
]


class DailyGoalLog(Base):
    """Records whether each daily goal was completed or missed for a given day."""
    __tablename__ = "daily_goal_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    goal_key: Mapped[str] = mapped_column(String, nullable=False)   # e.g. "gym"
    goal_title: Mapped[str] = mapped_column(String, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    xp_change: Mapped[int] = mapped_column(Integer, default=0)      # positive or negative
    logged_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="daily_logs")  # type: ignore[name-defined]