"""
Goal prediction ML.

1. Completion probability — can you hit the goal by the deadline?
2. Projected completion date — when will you actually hit it?
3. Required weekly pace — how much per week to stay on track?
"""
import numpy as np
from datetime import datetime, date, timedelta
from typing import Optional
from sklearn.linear_model import LinearRegression


def days_between(d1: date, d2: date) -> int:
    return (d2 - d1).days


def predict_goal(goal: dict, transactions: list[dict]) -> dict:
    """
    Analyse a single goal and return prediction insights.
    goal: {id, title, type, target_value, current_value, deadline, created_at, difficulty}
    transactions: all user transactions
    """
    today = date.today()
    created = datetime.fromisoformat(str(goal["created_at"])).date()
    deadline = datetime.fromisoformat(str(goal["deadline"])).date() if goal.get("deadline") else None

    target = float(goal["target_value"])
    current = float(goal["current_value"])
    remaining = target - current

    if remaining <= 0:
        return None  # already complete

    days_active = max(1, days_between(created, today))

    # ── Savings goal: track deposits/income ──────────────────────────────────
    if goal.get("type") in ("SAVINGS", "NET_WORTH"):
        # Get income transactions since goal was created
        income_txs = [
            tx for tx in transactions
            if tx["amount"] < 0  # negative = income
            and datetime.fromisoformat(str(tx["date"])).date() >= created
        ]

        if len(income_txs) >= 2:
            # Build daily savings series
            income_by_day: dict[date, float] = {}
            for tx in income_txs:
                d = datetime.fromisoformat(str(tx["date"])).date()
                income_by_day[d] = income_by_day.get(d, 0) + abs(tx["amount"])

            # Cumulative savings over time
            sorted_days = sorted(income_by_day.keys())
            cumulative = 0.0
            series = []
            for d in sorted_days:
                cumulative += income_by_day[d]
                series.append((days_between(created, d), cumulative))

            if len(series) >= 2:
                X = np.array([s[0] for s in series]).reshape(-1, 1)
                y = np.array([s[1] for s in series])
                model = LinearRegression()
                model.fit(X, y)

                # Daily savings rate
                daily_rate = max(0.0, float(model.coef_[0]))
                weekly_rate = daily_rate * 7

                # Projected days to completion
                if daily_rate > 0:
                    days_to_complete = remaining / daily_rate
                    projected_date = today + timedelta(days=int(days_to_complete))
                else:
                    days_to_complete = float("inf")
                    projected_date = None

                # Completion probability
                if deadline:
                    days_left = days_between(today, deadline)
                    needed_daily = remaining / days_left if days_left > 0 else float("inf")

                    if daily_rate >= needed_daily:
                        probability = min(0.95, 0.60 + (daily_rate / needed_daily) * 0.3)
                    else:
                        ratio = daily_rate / needed_daily if needed_daily > 0 else 0
                        probability = max(0.05, ratio * 0.60)

                    on_track = daily_rate >= needed_daily * 0.9

                    insights = []

                    # Pace insight
                    insights.append({
                        "type": "GOAL_PACE",
                        "severity": "INFO" if on_track else "WARNING",
                        "category": goal["id"],
                        "title": f"{'On track' if on_track else 'Behind pace'} — {goal['title']}",
                        "body": (
                            f"You're saving R{weekly_rate:,.0f}/week toward this goal. "
                            f"You need R{needed_daily*7:,.0f}/week to hit R{target:,.0f} "
                            f"by {deadline.strftime('%d %b %Y')}. "
                            + (
                                "You're on track! 🎯" if on_track
                                else f"You're R{(needed_daily - daily_rate)*7:,.0f}/week short."
                            )
                        ),
                        "value": weekly_rate,
                        "confidence": float(min(model.score(X, y) + 0.2, 0.90)),
                    })

                    # Probability insight
                    insights.append({
                        "type": "GOAL_PROBABILITY",
                        "severity": "INFO" if probability >= 0.6 else "WARNING",
                        "category": goal["id"],
                        "title": f"{probability:.0%} chance of hitting '{goal['title']}'",
                        "body": (
                            f"Based on your current savings pace, there's a "
                            f"{probability:.0%} chance you'll reach R{target:,.0f} "
                            f"by {deadline.strftime('%d %b %Y')}. "
                            + (
                                f"Projected completion: {projected_date.strftime('%d %b %Y')}."
                                if projected_date else "Keep it up!"
                            )
                        ),
                        "value": probability,
                        "confidence": 0.75,
                    })

                    return {"insights": insights}

                else:
                    # No deadline — just show projected completion
                    if projected_date:
                        return {
                            "insights": [{
                                "type": "GOAL_PACE",
                                "severity": "INFO",
                                "category": goal["id"],
                                "title": f"Projected: {goal['title']}",
                                "body": (
                                    f"At your current rate of R{weekly_rate:,.0f}/week, "
                                    f"you'll reach R{target:,.0f} by "
                                    f"{projected_date.strftime('%d %b %Y')} "
                                    f"({int(days_to_complete)} days from now)."
                                ),
                                "value": weekly_rate,
                                "confidence": 0.70,
                            }]
                        }

    # ── Spending limit goal ───────────────────────────────────────────────────
    elif goal.get("type") == "SPENDING_LIMIT":
        spent = float(goal["current_value"])
        budget = target
        pct_used = (spent / budget * 100) if budget > 0 else 0
        days_into_month = today.day
        expected_pct = (days_into_month / 30) * 100

        if pct_used > expected_pct + 15:
            return {
                "insights": [{
                    "type": "GOAL_PACE",
                    "severity": "WARNING",
                    "category": goal["id"],
                    "title": f"Spending limit at risk — {goal['title']}",
                    "body": (
                        f"You've used {pct_used:.0f}% of your R{budget:,.0f} budget "
                        f"but it's only day {days_into_month} of the month. "
                        f"At this pace you'll exceed your limit by "
                        f"R{((pct_used/100)*budget - budget*(days_into_month/30)):,.0f}."
                    ),
                    "value": pct_used,
                    "confidence": 0.80,
                }]
            }

    return None


def analyse_all_goals(goals: list[dict], transactions: list[dict]) -> list[dict]:
    """Run predictions on all active goals and return flat insight list."""
    all_insights = []
    for goal in goals:
        if goal.get("completed"):
            continue
        result = predict_goal(goal, transactions)
        if result:
            all_insights.extend(result["insights"])
    return all_insights