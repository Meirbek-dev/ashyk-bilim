"""Durable XP-award task.

Replaces both:
- ``XPAwardSubscriber.handle()`` (in-process EventBus handler, lost on crash)
- ``_award_xp_on_publish()`` inline call in ``services/grading/teacher.py``

The task is idempotent via the ``idempotency_key`` stored in the
``XPTransaction`` table — if the task executes twice for the same
``submission_uuid``, the second call is a no-op (DB uniqueness constraint).

Retry policy: up to 3 attempts with taskiq's default exponential backoff.
A failure in XP award must never surface to the student's grade response,
which is why this runs as a deferred task rather than inline.
"""

from __future__ import annotations

import logging

from src.worker.broker import broker

logger = logging.getLogger(__name__)


@broker.task(
    task_name="gamification:award_xp",
    retry_on_error=True,
    max_retries=3,
)
async def award_xp_for_submission(
    submission_uuid: str,
    user_id: int,
    assessment_type: str,
) -> None:
    """Award XP for a passing, published submission.

    Idempotent — the gamification service checks the ``idempotency_key``
    (``submission_{submission_uuid}``) before inserting a new ``XPTransaction``
    row, so replaying this task is always safe.

    Args:
        submission_uuid: The submission that was just published.
        user_id: The student who owns the submission.
        assessment_type: ``AssessmentType`` value string (QUIZ, EXAM, etc.).

    """
    try:
        import asyncio

        await asyncio.to_thread(
            _award_xp_sync,
            submission_uuid=submission_uuid,
            user_id=user_id,
            assessment_type=assessment_type,
        )
    except Exception:
        logger.exception("xp_award_failed submission=%s user=%s", submission_uuid, user_id)
        raise  # Let taskiq retry


def _award_xp_sync(
    *,
    submission_uuid: str,
    user_id: int,
    assessment_type: str,
) -> None:
    """Synchronous DB work — runs in a thread pool via asyncio.to_thread."""
    from sqlmodel import Session, select

    from src.db.gamification import XPSource
    from src.db.grading.progress import AssessmentPolicy
    from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
    from src.infra.db.engine import get_bg_engine
    from src.services.gamification.service import award_xp

    xp_source_map: dict[str, XPSource] = {
        AssessmentType.QUIZ: XPSource.QUIZ_COMPLETION,
        AssessmentType.EXAM: XPSource.EXAM_COMPLETION,
        AssessmentType.CODE_CHALLENGE: XPSource.CODE_CHALLENGE_COMPLETION,
    }

    engine = get_bg_engine()
    with Session(engine) as db:
        submission = db.exec(select(Submission).where(Submission.submission_uuid == submission_uuid)).first()
        if submission is None:
            logger.warning("xp_award_task submission_not_found submission=%s", submission_uuid)
            return

        # Only award XP for published submissions that passed.
        if submission.status != SubmissionStatus.PUBLISHED:
            return

        policy = None
        if submission.assessment_policy_id is not None:
            policy = db.get(AssessmentPolicy, submission.assessment_policy_id)
        if policy is None:
            policy = db.exec(
                select(AssessmentPolicy).where(AssessmentPolicy.activity_id == submission.activity_id)
            ).first()

        passing_score = float(policy.passing_score) if policy is not None else 60.0
        final_score = float(submission.final_score or 0)
        if final_score < passing_score:
            return

        try:
            xp_source = xp_source_map.get(
                AssessmentType(assessment_type),
                XPSource.QUIZ_COMPLETION,
            )
        except ValueError:
            xp_source = XPSource.QUIZ_COMPLETION

        award_xp(
            db=db,
            user_id=user_id,
            source=xp_source.value,
            source_id=submission_uuid,
            idempotency_key=f"submission_{submission_uuid}",
        )
        db.commit()
        logger.info(
            "xp_awarded submission=%s user=%s source=%s",
            submission_uuid,
            user_id,
            xp_source.value,
        )
