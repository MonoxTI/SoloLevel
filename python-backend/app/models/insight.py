import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class Insight(Base):
    """
    A single ML-generated insight for a user.
    type: ANOMALY | PREDICTION | TREND | GOAL_PACE | GOAL_PROBABILITY
    severity: INFO | WARNING | ALERT
    """
    __tablename__ = "insights"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, default="INFO")
    category: Mapped[str | None] = mapped_column(String, nullable=True)   # spending category or goal id
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)      # numeric value e.g. predicted spend
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True) # 0-1 model confidence
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    @property
    def age_days(self) -> int:
        return (datetime.utcnow() - self.generated_at).days