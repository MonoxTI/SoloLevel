from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models import Goal, GoalType, Difficulty, User
from app.services.xp import calc_level, xp_progress

router = APIRouter(prefix="/goals", tags=["goals"])


class GoalIn(BaseModel):
    user_id: str
    title: str
    description: Optional[str] = None
    type: GoalType
    difficulty: Difficulty = Difficulty.MEDIUM
    target_value: float
    current_value: float = 0.0
    deadline: Optional[datetime] = None


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    difficulty: Optional[Difficulty] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    deadline: Optional[datetime] = None


class GoalOut(BaseModel):
    id: str
    user_id: str
    title: str
    description: str | None
    type: GoalType
    difficulty: Difficulty
    xp_reward: int
    target_value: float
    current_value: float
    deadline: datetime | None
    completed: bool
    progress_pct: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class XPAward(BaseModel):
    xp_gained: int
    new_total: int
    new_level: int
    level_title: str
    leveled_up: bool
    progress: dict


def goal_to_out(g: Goal) -> GoalOut:
    pct = min(100.0, round((g.current_value / g.target_value) * 100, 1)) if g.target_value else 0
    return GoalOut(
        id=g.id, user_id=g.user_id, title=g.title, description=g.description,
        type=g.type, difficulty=g.difficulty, xp_reward=g.xp_reward,
        target_value=g.target_value, current_value=g.current_value,
        deadline=g.deadline, completed=g.completed, progress_pct=pct,
        created_at=g.created_at, updated_at=g.updated_at,
    )


@router.post("/", response_model=GoalOut, status_code=201)
async def create_goal(body: GoalIn, db: AsyncSession = Depends(get_db)):
    goal = Goal(
        user_id=body.user_id, title=body.title, description=body.description,
        type=body.type, difficulty=body.difficulty,
        target_value=body.target_value, current_value=body.current_value,
        deadline=body.deadline,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal_to_out(goal)


@router.get("/", response_model=list[GoalOut])
async def list_goals(
    user_id: str,
    completed: Optional[bool] = None,
    difficulty: Optional[Difficulty] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Goal).where(Goal.user_id == user_id)
    if completed is not None:
        q = q.where(Goal.completed == completed)
    if difficulty is not None:
        q = q.where(Goal.difficulty == difficulty)
    q = q.order_by(Goal.created_at.desc())
    result = await db.execute(q)
    return [goal_to_out(g) for g in result.scalars().all()]


@router.get("/{goal_id}", response_model=GoalOut)
async def get_goal(goal_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal_to_out(goal)


@router.patch("/{goal_id}", response_model=GoalOut)
async def update_goal(goal_id: str, body: GoalUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(goal, field, value)
    goal.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(goal)
    return goal_to_out(goal)


@router.post("/{goal_id}/complete", response_model=XPAward)
async def complete_goal(goal_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    if goal.completed:
        raise HTTPException(status_code=400, detail="Goal already completed")

    goal.completed = True
    goal.current_value = goal.target_value
    goal.updated_at = datetime.utcnow()

    user_result = await db.execute(select(User).where(User.id == goal.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_level = user.level
    user.xp += goal.xp_reward
    user.level = calc_level(user.xp)
    await db.commit()

    progress = xp_progress(user.xp, user.level)
    return XPAward(
        xp_gained=goal.xp_reward,
        new_total=user.xp,
        new_level=user.level,
        level_title=progress["title"],
        leveled_up=user.level > old_level,
        progress=progress,
    )


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(goal_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    await db.delete(goal)
    await db.commit()