"""Shared helpers for course/chapter/activity services."""

from sqlmodel import Session, select

from src.db.courses.activities import Activity


def _next_activity_order(chapter_id: int, db_session: Session) -> int:
    """Return the next available order index for an activity in *chapter_id*."""
    result = db_session.exec(
        select(Activity)
        .where(Activity.chapter_id == chapter_id)
        .order_by(Activity.order.desc())
    ).first()
    return (result.order if result else 0) + 1
