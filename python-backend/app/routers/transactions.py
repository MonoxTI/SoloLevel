from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.models import Transaction

router = APIRouter(prefix="/transactions", tags=["transactions"])

# ── keyword-based auto categorisation ─────────────────────────────────────────
CATEGORY_RULES: dict[str, list[str]] = {
    "Groceries":     ["pick n pay", "checkers", "woolworths food", "spar", "shoprite", "food lover"],
    "Transport":     ["uber", "bolt", "gautrain", "shell", "engen", "bp ", "caltex", "sasol"],
    "Dining Out":    ["restaurant", "café", "cafe", "mcdonalds", "kfc", "steers", "nandos", "debonairs"],
    "Subscriptions": ["netflix", "spotify", "showmax", "dstv", "amazon", "apple", "google"],
    "Utilities":     ["eskom", "municipality", "city power", "rand water", "telkom", "vodacom", "mtn"],
    "Shopping":      ["takealot", "mr price", "edgars", "woolworths", "zara", "h&m"],
    "Health":        ["clicks", "dischem", "pharmacy", "doctor", "dentist", "gym", "virgin active"],
    "ATM / Cash":    ["atm", "cash withdrawal"],
}


def auto_categorise(merchant: str) -> str:
    m = merchant.lower()
    for category, keywords in CATEGORY_RULES.items():
        if any(kw in m for kw in keywords):
            return category
    return "Other"


# ── schemas ────────────────────────────────────────────────────────────────────
class TransactionIn(BaseModel):
    user_id: str
    amount: float
    merchant: str
    category: Optional[str] = None   # if omitted, auto-detected
    note: Optional[str] = None
    date: Optional[datetime] = None


class TransactionOut(BaseModel):
    id: str
    user_id: str
    amount: float
    category: str
    merchant: str | None
    note: str | None
    date: datetime

    class Config:
        from_attributes = True


class SpendingSummary(BaseModel):
    category: str
    total: float
    count: int


# ── routes ─────────────────────────────────────────────────────────────────────
@router.post("/", response_model=TransactionOut, status_code=201)
async def create_transaction(body: TransactionIn, db: AsyncSession = Depends(get_db)):
    category = body.category or auto_categorise(body.merchant)
    tx = Transaction(
        user_id=body.user_id,
        amount=body.amount,
        category=category,
        merchant=body.merchant,
        note=body.note,
        date=body.date or datetime.now(timezone.utc),
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return tx


@router.get("/", response_model=list[TransactionOut])
async def list_transactions(
    user_id: str,
    limit: int = Query(50, le=200),
    offset: int = 0,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Transaction).where(Transaction.user_id == user_id)
    if category:
        q = q.where(Transaction.category == category)
    q = q.order_by(Transaction.date.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/summary", response_model=list[SpendingSummary])
async def spending_summary(
    user_id: str,
    month: int = Query(default=datetime.now().month),
    year: int = Query(default=datetime.now().year),
    db: AsyncSession = Depends(get_db),
):
    """Returns per-category totals for a given month."""
    q = (
        select(
            Transaction.category,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .where(Transaction.user_id == user_id)
        .where(extract("month", Transaction.date) == month)
        .where(extract("year", Transaction.date) == year)
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
    )
    result = await db.execute(q)
    return [{"category": r.category, "total": r.total, "count": r.count} for r in result]


@router.get("/{tx_id}", response_model=TransactionOut)
async def get_transaction(tx_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Transaction).where(Transaction.id == tx_id))
    tx = result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx


@router.delete("/{tx_id}", status_code=204)
async def delete_transaction(tx_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Transaction).where(Transaction.id == tx_id))
    tx = result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await db.delete(tx)
    await db.commit()