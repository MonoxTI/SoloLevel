from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models import User

router = APIRouter(prefix="/users", tags=["users"])


class UserIn(BaseModel):
    name: str


class UserOut(BaseModel):
    id: str
    name: str
    xp: int
    level: int
    streak: int
    last_active: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("/", response_model=UserOut, status_code=201)
async def create_user(body: UserIn, db: AsyncSession = Depends(get_db)):
    user = User(name=body.name)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user