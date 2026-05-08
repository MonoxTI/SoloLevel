from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models import NetWorthSnapshot, PortfolioTrade, Transaction, User

router = APIRouter(prefix="/finance", tags=["finance"])


# ── Net Worth ──────────────────────────────────────────────────────────────────
class NetWorthIn(BaseModel):
    user_id: str
    base_value: float
    yearly_budget_goal: float = 10000.0


class NetWorthOut(BaseModel):
    id: str
    user_id: str
    base_value: float
    current_value: float
    yearly_budget_goal: float
    saved_this_year: float
    budget_progress_pct: float
    budget_remaining: float
    last_updated: datetime


class NetWorthUpdate(BaseModel):
    base_value: Optional[float] = None
    yearly_budget_goal: Optional[float] = None


def nw_to_out(nw: NetWorthSnapshot) -> NetWorthOut:
    pct = min(100.0, round((nw.saved_this_year / nw.yearly_budget_goal) * 100, 1)) if nw.yearly_budget_goal else 0
    remaining = max(0.0, nw.yearly_budget_goal - nw.saved_this_year)
    return NetWorthOut(
        id=nw.id, user_id=nw.user_id,
        base_value=nw.base_value, current_value=nw.current_value,
        yearly_budget_goal=nw.yearly_budget_goal,
        saved_this_year=nw.saved_this_year,
        budget_progress_pct=pct,
        budget_remaining=remaining,
        last_updated=nw.last_updated,
    )


@router.post("/net-worth", response_model=NetWorthOut, status_code=201)
async def set_net_worth(body: NetWorthIn, db: AsyncSession = Depends(get_db)):
    """Set or reset net worth manually."""
    # Check if one already exists
    result = await db.execute(
        select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == body.user_id)
    )
    nw = result.scalar_one_or_none()

    if nw:
        nw.base_value = body.base_value
        nw.current_value = body.base_value
        nw.yearly_budget_goal = body.yearly_budget_goal
        nw.last_updated = datetime.utcnow()
    else:
        nw = NetWorthSnapshot(
            user_id=body.user_id,
            base_value=body.base_value,
            current_value=body.base_value,
            yearly_budget_goal=body.yearly_budget_goal,
        )
        db.add(nw)

    await db.commit()
    await db.refresh(nw)
    return nw_to_out(nw)


@router.get("/net-worth/{user_id}", response_model=NetWorthOut)
async def get_net_worth(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user_id)
    )
    nw = result.scalar_one_or_none()
    if not nw:
        raise HTTPException(status_code=404, detail="No net worth set yet. Use POST /finance/net-worth")
    return nw_to_out(nw)


@router.patch("/net-worth/{user_id}", response_model=NetWorthOut)
async def update_net_worth(user_id: str, body: NetWorthUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user_id)
    )
    nw = result.scalar_one_or_none()
    if not nw:
        raise HTTPException(status_code=404, detail="No net worth set yet")
    if body.base_value is not None:
        nw.base_value = body.base_value
        nw.current_value = body.base_value
    if body.yearly_budget_goal is not None:
        nw.yearly_budget_goal = body.yearly_budget_goal
    nw.last_updated = datetime.utcnow()
    await db.commit()
    await db.refresh(nw)
    return nw_to_out(nw)


@router.post("/net-worth/{user_id}/adjust")
async def adjust_net_worth(
    user_id: str,
    amount: float,
    description: str = "",
    db: AsyncSession = Depends(get_db),
):
    """
    Adjust net worth by an amount.
    Positive = income/deposit, Negative = expense.
    Called automatically when transactions are logged.
    """
    result = await db.execute(
        select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user_id)
    )
    nw = result.scalar_one_or_none()
    if not nw:
        return {"adjusted": False, "reason": "No net worth set"}

    nw.current_value += amount
    nw.last_updated = datetime.utcnow()

    # Track savings toward yearly goal (only positive amounts = income)
    if amount > 0:
        nw.saved_this_year += amount

    await db.commit()
    return {
        "adjusted": True,
        "amount": amount,
        "new_value": nw.current_value,
        "saved_this_year": nw.saved_this_year,
        "budget_progress_pct": min(100.0, round((nw.saved_this_year / nw.yearly_budget_goal) * 100, 1)),
    }


# ── Portfolio ──────────────────────────────────────────────────────────────────
class TradeIn(BaseModel):
    user_id: str
    symbol: str
    side: str           # BUY | SELL
    quantity: float
    entry_price: float
    is_paper: bool = True
    notes: Optional[str] = None


class TradeOut(BaseModel):
    id: str
    user_id: str
    symbol: str
    side: str
    quantity: float
    entry_price: float
    current_price: float
    exit_price: float | None
    status: str
    pnl: float
    pnl_pct: float
    is_paper: bool
    notes: str | None
    opened_at: datetime
    closed_at: datetime | None


class PortfolioSummary(BaseModel):
    open_trades: int
    total_invested: float
    total_pnl: float
    total_pnl_pct: float
    best_trade: str | None
    worst_trade: str | None
    trades: list[TradeOut]


def trade_to_out(t: PortfolioTrade) -> TradeOut:
    cost = t.entry_price * t.quantity
    pnl_pct = round((t.pnl / cost) * 100, 2) if cost else 0
    return TradeOut(
        id=t.id, user_id=t.user_id, symbol=t.symbol, side=t.side,
        quantity=t.quantity, entry_price=t.entry_price,
        current_price=t.current_price, exit_price=t.exit_price,
        status=t.status, pnl=t.pnl, pnl_pct=pnl_pct,
        is_paper=t.is_paper, notes=t.notes,
        opened_at=t.opened_at, closed_at=t.closed_at,
    )


@router.post("/trades", response_model=TradeOut, status_code=201)
async def open_trade(body: TradeIn, db: AsyncSession = Depends(get_db)):
    trade = PortfolioTrade(
        user_id=body.user_id, symbol=body.symbol.upper(),
        side=body.side.upper(), quantity=body.quantity,
        entry_price=body.entry_price, current_price=body.entry_price,
        is_paper=body.is_paper, notes=body.notes,
    )
    db.add(trade)
    await db.commit()
    await db.refresh(trade)
    return trade_to_out(trade)


@router.get("/trades/{user_id}", response_model=PortfolioSummary)
async def get_portfolio(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PortfolioTrade).where(PortfolioTrade.user_id == user_id)
        .order_by(PortfolioTrade.opened_at.desc())
    )
    trades = result.scalars().all()

    open_trades = [t for t in trades if t.status == "OPEN"]
    total_invested = sum(t.entry_price * t.quantity for t in open_trades)
    total_pnl = sum(t.pnl for t in trades)
    total_pnl_pct = round((total_pnl / total_invested) * 100, 2) if total_invested else 0

    sorted_by_pnl = sorted(trades, key=lambda t: t.pnl)
    worst = sorted_by_pnl[0].symbol if sorted_by_pnl else None
    best = sorted_by_pnl[-1].symbol if sorted_by_pnl else None

    return PortfolioSummary(
        open_trades=len(open_trades),
        total_invested=total_invested,
        total_pnl=total_pnl,
        total_pnl_pct=total_pnl_pct,
        best_trade=best,
        worst_trade=worst,
        trades=[trade_to_out(t) for t in trades],
    )


@router.patch("/trades/{trade_id}/close")
async def close_trade(
    trade_id: str,
    exit_price: float,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(PortfolioTrade).where(PortfolioTrade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade.status == "CLOSED":
        raise HTTPException(status_code=400, detail="Trade already closed")

    trade.exit_price = exit_price
    trade.current_price = exit_price
    trade.status = "CLOSED"
    trade.closed_at = datetime.utcnow()

    # Calculate P&L
    if trade.side == "BUY":
        trade.pnl = (exit_price - trade.entry_price) * trade.quantity
    else:
        trade.pnl = (trade.entry_price - exit_price) * trade.quantity

    await db.commit()
    return trade_to_out(trade)


@router.patch("/trades/{trade_id}/price")
async def update_trade_price(
    trade_id: str,
    current_price: float,
    db: AsyncSession = Depends(get_db),
):
    """Update current market price and recalculate unrealised P&L."""
    result = await db.execute(select(PortfolioTrade).where(PortfolioTrade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    trade.current_price = current_price
    if trade.side == "BUY":
        trade.pnl = (current_price - trade.entry_price) * trade.quantity
    else:
        trade.pnl = (trade.entry_price - current_price) * trade.quantity

    await db.commit()
    return {"symbol": trade.symbol, "pnl": trade.pnl, "current_price": current_price}