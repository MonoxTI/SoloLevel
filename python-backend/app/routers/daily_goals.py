from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models import User, DailyGoalLog, DAILY_GOALS

router = APIRouter(prefix="/daily-goals", tags=["daily-goals"])


class DailyGoalOut(BaseModel):
    key: str
    title: str
    xp_gain: int
    xp_loss: int
    completed: bool
    log_id: Optional[str] = None


class DailyStatusOut(BaseModel):
    date: date
    goals: list[DailyGoalOut]
    total_xp_today: int


class CompleteResult(BaseModel):
    goal_key: str
    completed: bool
    xp_change: int
    new_xp_total: int
    new_level: int
    leveled_up: bool
    message: str


def calc_level(xp: int) -> int:
    thresholds = [500, 1500, 3000, 5500, 9000, 14000, 20000]
    for i, t in enumerate(thresholds):
        if xp < t:
            return i + 1
    return len(thresholds) + 1


@router.get("/today", response_model=DailyStatusOut)
async def get_today_status(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get today's daily goals and completion status."""
    today = date.today()

    # Fetch any logs for today
    result = await db.execute(
        select(DailyGoalLog).where(
            and_(DailyGoalLog.user_id == user_id, DailyGoalLog.date == today)
        )
    )
    logs = {log.goal_key: log for log in result.scalars().all()}

    goals_out = []
    total_xp = 0
    for g in DAILY_GOALS:
        log = logs.get(g["key"])
        completed = log.completed if log else False
        if log:
            total_xp += log.xp_change
        goals_out.append(DailyGoalOut(
            key=g["key"],
            title=g["title"],
            xp_gain=g["xp_gain"],
            xp_loss=g["xp_loss"],
            completed=completed,
            log_id=log.id if log else None,
        ))

    return DailyStatusOut(date=today, goals=goals_out, total_xp_today=total_xp)


@router.post("/{goal_key}/complete", response_model=CompleteResult)
async def complete_daily(
    goal_key: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Mark a daily goal as completed — awards XP."""
    today = date.today()

    # Find the goal definition
    goal_def = next((g for g in DAILY_GOALS if g["key"] == goal_key), None)
    if not goal_def:
        raise HTTPException(status_code=404, detail=f"Unknown daily goal: {goal_key}")

    # Check if already logged today
    existing = await db.execute(
        select(DailyGoalLog).where(
            and_(
                DailyGoalLog.user_id == user_id,
                DailyGoalLog.goal_key == goal_key,
                DailyGoalLog.date == today,
            )
        )
    )
    log = existing.scalar_one_or_none()
    if log and log.completed:
        raise HTTPException(status_code=400, detail="Already completed today")

    # Get user
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    xp_change = goal_def["xp_gain"]
    old_level = user.level
    user.xp = max(0, user.xp + xp_change)
    user.level = calc_level(user.xp)

    # Create or update log
    if log:
        log.completed = True
        log.xp_change = xp_change
        log.logged_at = datetime.utcnow()
    else:
        log = DailyGoalLog(
            user_id=user_id,
            goal_key=goal_key,
            goal_title=goal_def["title"],
            date=today,
            completed=True,
            xp_change=xp_change,
        )
        db.add(log)

    await db.commit()

    return CompleteResult(
        goal_key=goal_key,
        completed=True,
        xp_change=xp_change,
        new_xp_total=user.xp,
        new_level=user.level,
        leveled_up=user.level > old_level,
        message=f"✅ {goal_def['title']} done! +{xp_change} XP",
    )


@router.post("/{goal_key}/miss", response_model=CompleteResult)
async def miss_daily(
    goal_key: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Mark a daily goal as missed — deducts XP. Called by scheduler at end of day."""
    today = date.today()

    goal_def = next((g for g in DAILY_GOALS if g["key"] == goal_key), None)
    if not goal_def:
        raise HTTPException(status_code=404, detail=f"Unknown daily goal: {goal_key}")

    # Don't penalise if already completed
    existing = await db.execute(
        select(DailyGoalLog).where(
            and_(
                DailyGoalLog.user_id == user_id,
                DailyGoalLog.goal_key == goal_key,
                DailyGoalLog.date == today,
            )
        )
    )
    log = existing.scalar_one_or_none()
    if log and log.completed:
        raise HTTPException(status_code=400, detail="Goal was completed — no penalty")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    xp_change = -goal_def["xp_loss"]
    old_level = user.level
    user.xp = max(0, user.xp + xp_change)
    user.level = calc_level(user.xp)

    if not log:
        log = DailyGoalLog(
            user_id=user_id,
            goal_key=goal_key,
            goal_title=goal_def["title"],
            date=today,
            completed=False,
            xp_change=xp_change,
        )
        db.add(log)

    await db.commit()

    return CompleteResult(
        goal_key=goal_key,
        completed=False,
        xp_change=xp_change,
        new_xp_total=user.xp,
        new_level=user.level,
        leveled_up=False,
        message=f"❌ {goal_def['title']} missed. {xp_change} XP",
    )