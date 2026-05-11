"""
Spending pattern ML.

1. Anomaly detection  — IsolationForest flags unusual spend in a category
2. Spend prediction   — LinearRegression predicts next month per category
3. Trend detection    — rolling average direction (UP / DOWN / STABLE)
"""
import numpy as np
from datetime import datetime, date
from typing import Optional
from collections import defaultdict

from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression


def group_by_month(transactions: list[dict]) -> dict[str, dict[str, float]]:
    """
    Group transactions by (year-month, category) → total spend.
    transactions: list of {amount, category, date} dicts
    Returns: { "2025-01": {"Groceries": 2300, "Transport": 800}, ... }
    """
    monthly: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for tx in transactions:
        if tx["amount"] <= 0:  # skip income
            continue
        dt = tx["date"] if isinstance(tx["date"], date) else datetime.fromisoformat(str(tx["date"])).date()
        key = f"{dt.year}-{dt.month:02d}"
        monthly[key][tx["category"]] += tx["amount"]
    return {k: dict(v) for k, v in sorted(monthly.items())}


def detect_anomalies(transactions: list[dict]) -> list[dict]:
    """
    Flag categories where this month's spend is anomalously high
    compared to historical months.
    Returns list of anomaly dicts.
    """
    monthly = group_by_month(transactions)
    if len(monthly) < 3:
        return []  # need at least 3 months of history

    months = sorted(monthly.keys())
    current_month = months[-1]
    history_months = months[:-1]

    # Get all categories that appear in history
    all_cats = set()
    for m in history_months:
        all_cats.update(monthly[m].keys())

    anomalies = []
    for cat in all_cats:
        # Build historical spend series for this category
        hist_values = [monthly[m].get(cat, 0) for m in history_months]
        current_val = monthly[current_month].get(cat, 0)

        if len(hist_values) < 3 or current_val == 0:
            continue

        hist_arr = np.array(hist_values).reshape(-1, 1)
        curr_arr = np.array([[current_val]])

        # IsolationForest: -1 = anomaly, 1 = normal
        model = IsolationForest(contamination=0.15, random_state=42)
        model.fit(hist_arr)
        pred = model.predict(curr_arr)[0]

        hist_mean = float(np.mean(hist_values))
        hist_std  = float(np.std(hist_values))
        pct_above = ((current_val - hist_mean) / hist_mean * 100) if hist_mean > 0 else 0

        if pred == -1 and current_val > hist_mean:
            severity = "ALERT" if pct_above > 50 else "WARNING"
            anomalies.append({
                "type": "ANOMALY",
                "severity": severity,
                "category": cat,
                "title": f"Unusual {cat} spending",
                "body": (
                    f"You've spent R{current_val:,.0f} on {cat} this month — "
                    f"{pct_above:.0f}% above your average of R{hist_mean:,.0f}. "
                    f"Your typical range is R{max(0, hist_mean-hist_std):,.0f}–R{hist_mean+hist_std:,.0f}."
                ),
                "value": current_val,
                "confidence": 0.80,
            })

    return anomalies


def predict_next_month(transactions: list[dict]) -> list[dict]:
    """
    Predict next month's spend per category using LinearRegression.
    Uses month index (1, 2, 3...) as the feature.
    Returns list of prediction dicts.
    """
    monthly = group_by_month(transactions)
    if len(monthly) < 3:
        return []

    months = sorted(monthly.keys())
    all_cats = set()
    for m in months:
        all_cats.update(monthly[m].keys())

    predictions = []
    next_month_idx = len(months) + 1

    for cat in all_cats:
        values = [monthly[m].get(cat, 0) for m in months]
        if sum(values) == 0:
            continue

        X = np.array(range(1, len(values) + 1)).reshape(-1, 1)
        y = np.array(values)

        model = LinearRegression()
        model.fit(X, y)
        predicted = float(model.predict([[next_month_idx]])[0])
        predicted = max(0, predicted)  # can't be negative

        current = values[-1]
        trend_pct = ((predicted - current) / current * 100) if current > 0 else 0
        r2 = float(model.score(X, y))  # model fit quality

        if r2 < 0.3:
            continue  # skip if model fit is too poor

        direction = "increase" if trend_pct > 5 else "decrease" if trend_pct < -5 else "stay similar"
        severity = "WARNING" if trend_pct > 20 else "INFO"

        predictions.append({
            "type": "PREDICTION",
            "severity": severity,
            "category": cat,
            "title": f"{cat} next month",
            "body": (
                f"Based on your spending history, {cat} is expected to "
                f"{direction} to R{predicted:,.0f} next month "
                f"(currently R{current:,.0f} this month)."
            ),
            "value": predicted,
            "confidence": round(min(r2 + 0.3, 0.95), 2),
        })

    return sorted(predictions, key=lambda x: -x["value"])[:6]  # top 6 categories


def detect_trends(transactions: list[dict]) -> list[dict]:
    """
    Identify categories trending UP or DOWN over the last 3 months.
    Uses simple slope of rolling 3-month average.
    """
    monthly = group_by_month(transactions)
    if len(monthly) < 3:
        return []

    months = sorted(monthly.keys())[-4:]  # last 4 months
    all_cats = set()
    for m in months:
        all_cats.update(monthly[m].keys())

    trends = []
    for cat in all_cats:
        values = [monthly[m].get(cat, 0) for m in months]
        if len(values) < 3 or sum(values) == 0:
            continue

        # Simple linear slope over last 3 months
        recent = values[-3:]
        slope = (recent[-1] - recent[0]) / 2  # average change per month

        avg = float(np.mean(recent))
        slope_pct = (slope / avg * 100) if avg > 0 else 0

        if abs(slope_pct) < 10:
            continue  # not significant enough

        direction = "UP" if slope_pct > 0 else "DOWN"
        severity = "WARNING" if (direction == "UP" and slope_pct > 25) else "INFO"

        trends.append({
            "type": "TREND",
            "severity": severity,
            "category": cat,
            "title": f"{cat} trending {direction.lower()}",
            "body": (
                f"Your {cat} spending has been trending {direction.lower()} "
                f"over the last 3 months — "
                f"{'increasing' if direction == 'UP' else 'decreasing'} "
                f"by about R{abs(slope):,.0f}/month on average."
            ),
            "value": slope,
            "confidence": 0.70,
        })

    return trends