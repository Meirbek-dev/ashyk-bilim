"""Background task: auto-publish scheduled assessments.

Runs every ``POLL_INTERVAL_SECONDS`` (default 60). On each tick it queries for
assessments whose ``scheduled_at`` is in the past and whose lifecycle is still
``SCHEDULED``, then transitions them to ``PUBLISHED``.

Wire into app startup via ``lifespan.py``:

    from src.tasks.assignment_scheduler import assignment_scheduler_loop
    asyncio.create_task(assignment_scheduler_loop(settings), name="assignment_scheduler")
"""

import asyncio
import logging
from datetime import UTC, datetime

from src.db.assessments import Assessment, AssessmentLifecycle
from src.db.courses.activities import Activity
from src.infra.db.engine import get_bg_engine
from src.infra.settings import AppSettings

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS: int = 60


async def assignment_scheduler_loop(settings: AppSettings) -> None:
    """Periodic loop that auto-publishes SCHEDULED assessments."""
    logger.info(
        "Assessment scheduler started (poll interval: %ds)", POLL_INTERVAL_SECONDS
    )
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        try:
            await asyncio.to_thread(_publish_due_assignments)
        except Exception:
            logger.exception("Assessment scheduler tick failed; will retry next cycle")


def _publish_due_assignments() -> int:
    """Synchronous DB work executed in a thread-pool to avoid blocking the loop.

    Returns the number of assessments published in this tick.
    """
    from sqlmodel import Session, select

    try:
        engine = get_bg_engine()
    except RuntimeError:
        return 0  # engine not yet registered (e.g. during test setup)

    now = datetime.now(UTC)
    published = 0

    with Session(engine) as db:
        due_assessments = db.exec(
            select(Assessment).where(
                Assessment.lifecycle == AssessmentLifecycle.SCHEDULED,
                Assessment.scheduled_at <= now,
            )
        ).all()

        for assessment in due_assessments:
            try:
                activity = db.get(Activity, assessment.activity_id)
                assessment.lifecycle = AssessmentLifecycle.PUBLISHED
                assessment.published_at = now
                assessment.scheduled_at = None
                assessment.updated_at = now
                db.add(assessment)

                if activity is not None:
                    activity.published = True
                    db.add(activity)

                db.commit()
                published += 1
                logger.info(
                    "Auto-published assessment %s",
                    assessment.assessment_uuid,
                )
            except Exception:
                db.rollback()
                logger.exception(
                    "Failed to auto-publish assessment %s",
                    assessment.assessment_uuid,
                )

    return published
