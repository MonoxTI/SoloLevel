"""
Deriv trading router — endpoints for status, positions, manual scan, and debug.
"""
from fastapi import APIRouter, HTTPException
from app.services.deriv.scheduler import get_deriv_trader

router = APIRouter(prefix="/deriv", tags=["deriv"])


@router.get("/status")
async def deriv_status():
    trader = get_deriv_trader()
    if not trader:
        return {"connected": False, "reason": "DERIV_API_TOKEN not set in .env"}
    if not trader.client.connected:
        return {"connected": False, "reason": "Client not connected"}
    acc = trader.client.account
    return {
        "connected":    True,
        "login_id":     acc.login_id if acc else None,
        "account_type": acc.account_type if acc else None,
        "balance":      acc.balance if acc else None,
        "currency":     acc.currency if acc else None,
    }


@router.get("/balance")
async def deriv_balance():
    trader = get_deriv_trader()
    if not trader or not trader.client.connected:
        raise HTTPException(status_code=503, detail="Deriv not connected")
    balance = await trader.client.get_balance()
    return {"balance": balance, "currency": trader.client.account.currency}


@router.get("/positions")
async def deriv_positions():
    trader = get_deriv_trader()
    if not trader or not trader.client.connected:
        raise HTTPException(status_code=503, detail="Deriv not connected")
    positions = await trader.client.get_open_contracts()
    return {
        "positions": [
            {
                "contract_id":   p.contract_id,
                "symbol":        p.symbol,
                "direction":     p.direction,
                "stake":         p.stake,
                "entry_price":   p.entry_price,
                "current_price": p.current_price,
                "profit":        p.profit,
                "status":        p.status,
            }
            for p in positions
        ]
    }


@router.get("/history")
async def deriv_history(limit: int = 10):
    trader = get_deriv_trader()
    if not trader or not trader.client.connected:
        raise HTTPException(status_code=503, detail="Deriv not connected")
    trades = await trader.client.get_profit_table(limit=limit)
    return {"trades": trades}


@router.post("/scan")
async def deriv_manual_scan():
    trader = get_deriv_trader()
    if not trader:
        raise HTTPException(status_code=503, detail="DERIV_API_TOKEN not configured")
    if not trader.client.connected:
        ok, msg = await trader.start()
        if not ok:
            raise HTTPException(status_code=503, detail=f"Connection failed: {msg}")
    results = await trader.run_scan()
    return {"trades_placed": len(results), "results": results}


@router.post("/sell/{contract_id}")
async def deriv_sell(contract_id: int):
    trader = get_deriv_trader()
    if not trader or not trader.client.connected:
        raise HTTPException(status_code=503, detail="Deriv not connected")
    ok, result = await trader.client.sell_contract(contract_id)
    if not ok:
        raise HTTPException(status_code=400, detail=result.get("error"))
    return {"sold": True, "result": result}


@router.get("/summary")
async def deriv_summary():
    trader = get_deriv_trader()
    if not trader or not trader.client.connected:
        return {"connected": False}
    balance = await trader.client.get_balance()
    positions = await trader.client.get_open_contracts()
    total_pnl = sum(p.profit for p in positions)
    return {
        "connected":    True,
        "balance":      balance,
        "currency":     trader.client.account.currency,
        "open_trades":  len(positions),
        "total_pnl":    total_pnl,
        "trades_today": trader.daily_trades,
    }