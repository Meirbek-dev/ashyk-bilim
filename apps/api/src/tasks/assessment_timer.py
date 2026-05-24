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
from typing import TYPE_CHECKING

from src.infra.db.engine import get_bg_engine
from src.infra.settings import AppSettings

if TYPE_CHECKING:
    from sqlmodel import Session

    from src.db.grading.submissions import Submission

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS: int = 30


async def assessment_timer_loop(settings: AppSettings) -> None:
    """Periodic loop that auto-submits timed-out DRAFT submissions."""
    logger.info("Assessment timer started (poll interval: %ds)", POLL_INTERVAL_SECONDS)
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        try:
            await _auto_submit_expired_drafts()
        except Exception:
            logger.exception("Assessment timer tick failed; will retry next cycle")


async def _auto_submit_expired_drafts() -> int:
    """Find and auto-submit any DRAFT submissions that have exceeded their time limit.

    Returns the number of submissions auto-submitted in this tick.
    """
    from sqlmodel import Session, select

    from src.db.assessments import Assessment, AssessmentLifecycle
    from src.db.grading.progress import AssessmentPolicy
    from src.db.grading.submissions import Submission, SubmissionStatus
    from src.db.users import PublicUser, User
    from src.services.grading.pipeline.orchestrator import (
        submit_assessment as submit_assessment_pipeline,
    )
    from src.services.grading.settings_loader import load_activity_settings

    try:
        engine = get_bg_engine()
    except RuntimeError:
        return 0  # engine not yet registered (e.g. during test setup)

    now = datetime.now(UTC)
    count = 0

    with Session(engine) as db_session:
        # Fetch all DRAFT submissions that have started_at set.
        # We join to the policy to get the canonical time limit in seconds,
        # and User to get metadata for PublicUser instantiation.
        candidates = db_session.exec(
            select(Submission, AssessmentPolicy, User)
            .join(
                AssessmentPolicy,
                Submission.assessment_policy_id == AssessmentPolicy.id,
            )
            .join(
                User,
                Submission.user_id == User.id,
            )
            .where(Submission.status == SubmissionStatus.DRAFT)
            .where(Submission.started_at.is_not(None))  # type: ignore[union-attr]
            .where(AssessmentPolicy.time_limit_seconds.is_not(None))  # type: ignore[union-attr]
        ).all()

        for submission, policy, user in candidates:
            if policy.time_limit_seconds is None or submission.started_at is None:
                continue

            started = submission.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=UTC)

            deadline = started + timedelta(seconds=policy.time_limit_seconds)
            if now < deadline:
                continue  # not yet expired

            # Auto-submit the draft through the canonical grading pipeline
            try:
                public_user = PublicUser(
                    id=user.id,
                    username=user.username,
                    email=user.email,
                    first_name=user.first_name,
                    last_name=user.last_name,
                )

                settings = load_activity_settings(
                    submission.activity_id,
                    submission.assessment_type,
                    db_session,
                )

                # Pre-populate metadata before submission
                metadata: dict = submission.metadata_json or {}
                metadata["auto_submit_reason"] = "TIME_EXPIRED"
                metadata["auto_submitted_at"] = now.isoformat()
                submission.metadata_json = metadata
                db_session.add(submission)
                db_session.commit()
                db_session.refresh(submission)

                # Grade and submit
                await submit_assessment_pipeline(
                    activity_id=submission.activity_id,
                    assessment_type=submission.assessment_type,
                    answers_payload=submission.answers_json,
                    settings=settings,
                    current_user=public_user,
                    db_session=db_session,
                    submission_uuid=submission.submission_uuid,
                    skip_permission=True,
                    skip_policy_constraints=True,
                )

                count += 1
                logger.info(
                    "assessment_timer: auto-submitted and graded submission_uuid=%s user_id=%s "
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
