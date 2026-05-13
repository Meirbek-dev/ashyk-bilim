"""Background task: auto-submit timed-out assessment drafts.

Runs every ``POLL_INTERVAL_SECONDS`` (default 30). On each tick it queries for
DRAFT submissions that have an active timer and whose deadline has passed, then
auto-submits them as if the student clicked "Submit".

Wire into app startup via ``lifespan.py``:

    from src.tasks.assessment_timer import assessment_timer_loop
    asyncio.create_task(assessment_timer_loop(settings), name="assessment_timer")
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from src.infra.db.engine import get_bg_engine
from src.infra.settings import AppSettings

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS: int = 30


async def assessment_timer_loop(settings: AppSettings) -> None:
    """Periodic loop that auto-submits timed-out DRAFT submissions."""
    logger.info(
        "Assessment timer started (poll interval: %ds)", POLL_INTERVAL_SECONDS
    )
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        try:
            await asyncio.to_thread(_auto_submit_expired_drafts)
        except Exception:
            logger.exception(
                "Assessment timer tick failed; will retry next cycle"
            )


def _auto_submit_expired_drafts() -> int:
    """Find and auto-submit any DRAFT submissions that have exceeded their time limit.

    Returns the number of submissions auto-submitted in this tick.
    """
    from sqlmodel import Session, select

    from src.db.assessments import Assessment, AssessmentLifecycle
    from src.db.grading.progress import AssessmentPolicy
    from src.db.grading.submissions import Submission, SubmissionStatus

    try:
        engine = get_bg_engine()
    except RuntimeError:
        return 0  # engine not yet registered (e.g. during test setup)

    now = datetime.now(UTC)
    count = 0

    with Session(engine) as db_session:
        # Fetch all DRAFT submissions that have started_at set.
        # We join to the policy to get the canonical time limit in seconds.
        candidates = db_session.exec(
            select(Submission, AssessmentPolicy)
            .join(
                AssessmentPolicy,
                Submission.assessment_policy_id == AssessmentPolicy.id,
            )
            .where(Submission.status == SubmissionStatus.DRAFT)
            .where(Submission.started_at.is_not(None))  # type: ignore[union-attr]
            .where(AssessmentPolicy.time_limit_seconds.is_not(None))  # type: ignore[union-attr]
        ).all()

        for submission, policy in candidates:
            if policy.time_limit_seconds is None or submission.started_at is None:
                continue

            started = submission.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=UTC)

            deadline = started + timedelta(seconds=policy.time_limit_seconds)
            if now < deadline:
                continue  # not yet expired

            # Auto-submit the draft
            try:
                _force_submit(submission, db_session, now)
                count += 1
                logger.info(
                    "assessment_timer: auto-submitted submission_uuid=%s user_id=%s "
                    "(deadline=%s)",
                    submission.submission_uuid,
                    submission.user_id,
                    deadline.isoformat(),
                )
            except Exception:
                logger.exception(
                    "assessment_timer: failed to auto-submit submission_uuid=%s",
                    submission.submission_uuid,
                )
                db_session.rollback()

    if count:
        logger.info("assessment_timer: auto-submitted %d submission(s)", count)
    return count


def _force_submit(submission: "Submission", db_session: "Session", now: datetime) -> None:
    """Transition a DRAFT submission to PENDING and record the metadata."""
    from sqlmodel import Session  # ensure correct import in thread

    from src.db.grading.submissions import SubmissionStatus

    metadata: dict = submission.metadata_json or {}
    metadata["auto_submit_reason"] = "TIME_EXPIRED"
    metadata["auto_submitted_at"] = now.isoformat()

    submission.status = SubmissionStatus.PENDING
    submission.submitted_at = now
    submission.metadata_json = metadata
    submission.updated_at = now

    db_session.add(submission)
    db_session.commit()
