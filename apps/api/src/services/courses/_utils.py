"""Shared helpers for course/chapter/activity services."""

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.courses.activities import Activity
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course


def _activity_uuid_candidates(activity_uuid: str) -> tuple[str, ...]:
    """Return all possible variations of an activity UUID (with/without prefix)."""
    normalized = activity_uuid.strip()
    if not normalized:
        return (activity_uuid,)

    if normalized.startswith("activity_"):
        raw_uuid = normalized.removeprefix("activity_")
        return (normalized, raw_uuid) if raw_uuid else (normalized,)

    return (f"activity_{normalized}", normalized)


def _get_activity_by_uuid_or_404(activity_uuid: str, db_session: Session) -> Activity:
    """Robustly fetch an activity by any variant of its UUID."""
    candidates = _activity_uuid_candidates(activity_uuid)
    activity = db_session.exec(select(Activity).where(Activity.activity_uuid.in_(candidates))).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Активность не найдена")
    return activity


def _get_course_for_activity_or_404(activity: Activity, db_session: Session) -> Course:
    """Robustly resolve the course for an activity, preferring denormalized FK."""
    if activity.course_id is not None:
        course = db_session.get(Course, activity.course_id)
        if course is not None:
            return course

    if activity.chapter_id:
        chapter = db_session.get(Chapter, activity.chapter_id)
        if chapter and chapter.course_id:
            course = db_session.get(Course, chapter.course_id)
            if course:
                return course

    raise HTTPException(status_code=404, detail="Course not found")


def _next_activity_order(chapter_id: int, db_session: Session) -> int:
    """Return the next available order index for an activity in *chapter_id*."""
    result = db_session.exec(
        select(Activity).where(Activity.chapter_id == chapter_id).order_by(Activity.order.desc())
    ).first()
    return (result.order if result else 0) + 1
