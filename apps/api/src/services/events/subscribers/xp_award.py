"""XP award subscriber — replaces inline _award_xp_safe calls.

Awards XP when a grade is published and the student passed. Idempotent
via the submission_uuid-based idempotency key in the gamification service.
"""

from __future__ import annotations

import logging

from src.db.gamification import XPSource
from src.db.grading.submissions import AssessmentType
from src.services.events.types import GradePublishedEvent

logger = logging.getLogger(__name__)

_XP_SOURCE: dict[AssessmentType, XPSource] = {
    AssessmentType.QUIZ: XPSource.QUIZ_COMPLETION,
    AssessmentType.EXAM: XPSource.EXAM_COMPLETION,
    AssessmentType.CODE_CHALLENGE: XPSource.CODE_CHALLENGE_COMPLETION,
}


class XPAwardSubscriber:
    """Awards XP on grade publication for passing submissions."""

    async def handle(self, event: GradePublishedEvent) -> None:
        """Award XP if the student passed.

        Errors are logged and swallowed — gamification failures must never
        prevent grade publication.
        """
        try:
            from sqlmodel import Session

            from src.infra.db.engine import get_bg_engine
            from src.services.gamification.service import award_xp

            with Session(get_bg_engine()) as db:
                # Determine assessment type from submission
                from sqlmodel import select

                from src.db.grading.progress import AssessmentPolicy
                from src.db.grading.submissions import Submission

                submission = db.exec(
                    select(Submission).where(Submission.submission_uuid == event.submission_uuid)
                ).first()
                if submission is None:
                    return

                policy = None
                if submission.assessment_policy_id is not None:
                    policy = db.get(AssessmentPolicy, submission.assessment_policy_id)
                if policy is None:
                    policy = db.exec(
                        select(AssessmentPolicy).where(AssessmentPolicy.activity_id == submission.activity_id)
                    ).first()

                passing_score = float(policy.passing_score) if policy is not None else 60.0
                if float(event.final_score) < passing_score:
                    return

                xp_source = _XP_SOURCE.get(
                    AssessmentType(submission.assessment_type),
                    XPSource.QUIZ_COMPLETION,
                )
                award_xp(
                    db=db,
                    user_id=event.user_id,
                    source=xp_source.value,
                    source_id=event.submission_uuid,
                    idempotency_key=f"submission_{event.submission_uuid}",
                )
                db.commit()
        except Exception as exc:
            logger.warning(
                "xp_award_failed submission=%s error=%s",
                event.submission_uuid,
                exc,
            )
