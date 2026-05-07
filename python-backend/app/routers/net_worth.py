from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models import Transaction

router = APIRouter(prefix="/net-worth", tags=["net-worth"])


class NetWorthOut(BaseModel):
    user_id: str
    cash_balance: float
    total_spent_30d: float
    total_income_30d: float
    net_30d: float
    # Portfolio value will be added when trading module is ready
    estimated_net_worth: float
    calculated_at: datetime


@router.get("/", response_model=NetWorthOut)
async def get_net_worth(
    user_id: str,
    cash_balance: float = Query(description="Your current bank balance in ZAR"),
    db: AsyncSession = Depends(get_db),
):
    """
    Calculates a net worth snapshot.
    cash_balance is passed as a query param until bank API integration is done.
    """
    since = datetime.utcnow() - timedelta(days=30)

    # Total spent (positive amounts = expenses)
    spent_q = await db.execute(
        select(func.sum(Transaction.amount))
        .where(Transaction.user_id == user_id)
        .where(Transaction.date >= since)
        .where(Transaction.amount > 0)
    )
    total_spent = spent_q.scalar() or 0.0

    # Income (negative amounts = money in, convention)
    income_q = await db.execute(
        select(func.sum(Transaction.amount))
        .where(Transaction.user_id == user_id)
        .where(Transaction.date >= since)
        .where(Transaction.amount < 0)
    )
    total_income = abs(income_q.scalar() or 0.0)

    net_30d = total_income - total_spent

    return NetWorthOut(
        user_id=user_id,
        cash_balance=cash_balance,
        total_spent_30d=total_spent,
        total_income_30d=total_income,
        net_30d=net_30d,
        estimated_net_worth=cash_balance,
        calculated_at=datetime.utcnow(),
    )