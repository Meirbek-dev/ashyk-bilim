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

import sqlalchemy.exc

from src.infra.db.engine import get_bg_engine
from src.infra.settings import AppSettings

if TYPE_CHECKING:
    from sqlmodel import Session

    from src.db.grading.submissions import Submission
    from src.types import JsonObject

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS: int = 60

# A draft that fails to auto-submit stays DRAFT, so every tick would retry it
# forever.  Back the retries off exponentially and stop after MAX_ATTEMPTS so a
# single poisoned draft cannot hammer downstream services (e.g. Judge0).
MAX_AUTO_SUBMIT_ATTEMPTS: int = 5
RETRY_BACKOFF_BASE_SECONDS: int = 120
RETRY_BACKOFF_MAX_SECONDS: int = 3600


async def assessment_timer_loop(settings: AppSettings) -> None:
    """Periodic loop that auto-submits timed-out DRAFT submissions."""
    logger.info("Assessment timer started (poll interval: %ds)", POLL_INTERVAL_SECONDS)
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        try:
            await auto_submit_expired_drafts()
        except sqlalchemy.exc.ProgrammingError as exc:
            # Expected during rolling deploys: the API can start before migrations
            # complete, so referenced tables (e.g. assessment_policy) may not exist
            # yet.  Log at WARNING — not ERROR — to avoid alert fatigue.
            logger.warning(
                "Assessment timer skipped tick; schema not ready yet: %s",
                exc.orig,
            )
        except Exception:
            logger.exception("Assessment timer tick failed; will retry next cycle")


async def auto_submit_expired_drafts() -> int:
    """Find and auto-submit any DRAFT submissions that have exceeded their time limit.

    Returns the number of submissions auto-submitted in this tick.
    """
    from sqlmodel import Session, col, select

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
                col(Submission.assessment_policy_id) == col(AssessmentPolicy.id),
            )
            .join(
                User,
                col(Submission.user_id) == col(User.id),
            )
            .where(col(Submission.status) == SubmissionStatus.DRAFT)
            .where(col(Submission.started_at).is_not(None))
            .where(col(AssessmentPolicy.time_limit_seconds).is_not(None))
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

            if _is_backing_off(submission.metadata_json, now):
                continue

            # Auto-submit the draft through the canonical grading pipeline
            try:
                assert user.id is not None
                public_user = PublicUser(
                    id=user.id,
                    user_uuid=user.user_uuid,
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
                metadata: JsonObject = dict(submission.metadata_json or {})
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
                    "assessment_timer: auto-submitted and graded submission_uuid=%s user_id=%s (deadline=%s)",
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
                _record_failed_attempt(submission, db_session, now=now)

    if count:
        logger.info("assessment_timer: auto-submitted %d submission(s)", count)
    return count


def _is_backing_off(metadata: JsonObject | None, now: datetime) -> bool:
    """Whether a previously failed draft is still inside its retry backoff window."""
    metadata = metadata or {}
    attempts = metadata.get("auto_submit_failed_attempts")
    if not isinstance(attempts, int) or attempts <= 0:
        return False
    if attempts >= MAX_AUTO_SUBMIT_ATTEMPTS:
        return True  # given up; needs manual intervention

    retry_after = metadata.get("auto_submit_retry_after")
    if not isinstance(retry_after, str):
        return False
    try:
        parsed = datetime.fromisoformat(retry_after)
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return now < parsed


def _record_failed_attempt(submission: Submission, db_session: Session, *, now: datetime) -> None:
    """Persist the failure counter and the next retry timestamp on the draft."""
    try:
        metadata: JsonObject = dict(submission.metadata_json or {})
        previous = metadata.get("auto_submit_failed_attempts")
        attempts = (previous if isinstance(previous, int) else 0) + 1
        backoff = min(
            RETRY_BACKOFF_BASE_SECONDS * 2 ** (attempts - 1),
            RETRY_BACKOFF_MAX_SECONDS,
        )
        metadata["auto_submit_failed_attempts"] = attempts
        metadata["auto_submit_retry_after"] = (now + timedelta(seconds=backoff)).isoformat()
        submission.metadata_json = metadata
        db_session.add(submission)
        db_session.commit()

        if attempts >= MAX_AUTO_SUBMIT_ATTEMPTS:
            logger.error(
                "assessment_timer: giving up on submission_uuid=%s after %d failed auto-submit attempts; "
                "manual intervention required",
                submission.submission_uuid,
                attempts,
            )
        else:
            logger.warning(
                "assessment_timer: submission_uuid=%s auto-submit attempt %d/%d failed; retrying in %ds",
                submission.submission_uuid,
                attempts,
                MAX_AUTO_SUBMIT_ATTEMPTS,
                backoff,
            )
    except Exception:
        logger.exception(
            "assessment_timer: could not record failed auto-submit attempt for submission_uuid=%s",
            submission.submission_uuid,
        )
        db_session.rollback()
