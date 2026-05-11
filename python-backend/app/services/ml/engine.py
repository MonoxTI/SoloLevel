"""
ML engine — orchestrates all analysis and saves insights to the database.
Called by the weekly scheduler every Sunday at 20:00.
"""
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.services.ml.spending_ml import detect_anomalies, predict_next_month, detect_trends
from app.services.ml.goal_ml import analyse_all_goals
from app.models.insight import Insight

logger = logging.getLogger(__name__)


async def fetch_transactions(user_id: str, db: AsyncSession) -> list[dict]:
    from app.models import Transaction
    result = await db.execute(
        select(Transaction)
        .where(Transaction.user_id == user_id)
        .order_by(Transaction.date.asc())
    )
    txs = result.scalars().all()
    return [
        {
            "id": tx.id,
            "amount": tx.amount,
            "category": tx.category,
            "merchant": tx.merchant,
            "date": tx.date,
        }
        for tx in txs
    ]


async def fetch_goals(user_id: str, db: AsyncSession) -> list[dict]:
    from app.models import Goal
    result = await db.execute(
        select(Goal).where(Goal.user_id == user_id, Goal.completed == False)
    )
    goals = result.scalars().all()
    return [
        {
            "id": g.id,
            "title": g.title,
            "type": g.type.value,
            "difficulty": g.difficulty.value,
            "target_value": g.target_value,
            "current_value": g.current_value,
            "deadline": g.deadline,
            "created_at": g.created_at,
        }
        for g in goals
    ]


async def run_weekly_analysis(user_id: str, db: AsyncSession) -> list[Insight]:
    """
    Full ML pipeline for a user.
    Clears old insights, runs all models, saves new ones.
    Returns list of new Insight objects.
    """
    logger.info(f"Running weekly ML analysis for user {user_id}")

    # Fetch data
    transactions = await fetch_transactions(user_id, db)
    goals        = await fetch_goals(user_id, db)

    if len(transactions) < 5:
        logger.info("Not enough transaction data for ML analysis")
        return []

    # Run all models
    raw_insights = []
    raw_insights.extend(detect_anomalies(transactions))
    raw_insights.extend(predict_next_month(transactions))
    raw_insights.extend(detect_trends(transactions))
    raw_insights.extend(analyse_all_goals(goals, transactions))

    if not raw_insights:
        return []

    # Clear old insights for this user
    await db.execute(delete(Insight).where(Insight.user_id == user_id))

    # Save new insights
    saved = []
    for r in raw_insights:
        insight = Insight(
            user_id=user_id,
            type=r["type"],
            severity=r.get("severity", "INFO"),
            category=r.get("category"),
            title=r["title"],
            body=r["body"],
            value=r.get("value"),
            confidence=r.get("confidence"),
            generated_at=datetime.utcnow(),
        )
        db.add(insight)
        saved.append(insight)

    await db.commit()
    logger.info(f"Generated {len(saved)} insights for user {user_id}")
    return saved


def format_insights_for_telegram(insights: list[Insight]) -> str:
    """Format insights as a readable Telegram message."""
    if not insights:
        return "📊 *Weekly Insights*\n\nNot enough data yet. Keep logging transactions!"

    severity_emoji = {"ALERT": "🚨", "WARNING": "⚠️", "INFO": "💡"}
    type_labels = {
        "ANOMALY":          "Unusual Spending",
        "PREDICTION":       "Next Month Forecast",
        "TREND":            "Spending Trend",
        "GOAL_PACE":        "Goal Progress",
        "GOAL_PROBABILITY": "Goal Probability",
    }

    lines = ["📊 *Weekly ML Insights*\n"]

    # Group by type
    by_type: dict[str, list] = {}
    for ins in insights:
        by_type.setdefault(ins.type, []).append(ins)

    for ins_type, items in by_type.items():
        label = type_labels.get(ins_type, ins_type)
        lines.append(f"*{label}*")
        for item in items[:3]:  # max 3 per type
            emoji = severity_emoji.get(item.severity, "💡")
            lines.append(f"{emoji} {item.title}")
            lines.append(f"   _{item.body}_\n")

    return "\n".join(lines)