from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.insight import Insight
from app.services.ml.engine import run_weekly_analysis, format_insights_for_telegram

router = APIRouter(prefix="/insights", tags=["insights"])


class InsightOut(BaseModel):
    id: str
    type: str
    severity: str
    category: str | None
    title: str
    body: str
    value: float | None
    confidence: float | None
    read: bool
    generated_at: datetime

    class Config:
        from_attributes = True


@router.get("/{user_id}", response_model=list[InsightOut])
async def get_insights(
    user_id: str,
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Get all insights for a user, newest first."""
    q = select(Insight).where(Insight.user_id == user_id)
    if unread_only:
        q = q.where(Insight.read == False)
    q = q.order_by(Insight.generated_at.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/{user_id}/generate")
async def generate_insights(
    user_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger ML analysis. Runs in background."""
    async def run():
        await run_weekly_analysis(user_id, db)

    background_tasks.add_task(run)
    return {"status": "Analysis started — check /insights/{user_id} in a moment"}


@router.patch("/{insight_id}/read")
async def mark_read(insight_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Insight).where(Insight.id == insight_id))
    insight = result.scalar_one_or_none()
    if insight:
        insight.read = True
        await db.commit()
    return {"read": True}


@router.get("/{user_id}/telegram-digest")
async def telegram_digest(user_id: str, db: AsyncSession = Depends(get_db)):
    """Returns insights formatted as a Telegram message."""
    result = await db.execute(
        select(Insight)
        .where(Insight.user_id == user_id)
        .order_by(Insight.generated_at.desc())
        .limit(10)
    )
    insights = result.scalars().all()
    return {"message": format_insights_for_telegram(insights)}