"""Inline quiz creation service.

Creates a QUIZ assessment linked to a parent activity for embedding
inside lesson rich-text content.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.assessments import Assessment, AssessmentLifecycle
from src.db.courses.activities import Activity
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    GradeReleaseMode,
)
from src.db.grading.submissions import AssessmentType
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.security.rbac import PermissionChecker

logger = logging.getLogger(__name__)


class InlineQuizCreate(PydanticStrictBaseModel):
    """Request body for POST /assessments/inline-quiz."""

    activity_id: int
    title: str = "Inline Quiz"


class InlineQuizResponse(PydanticStrictBaseModel):
    """Response for POST /assessments/inline-quiz."""

    assessment_uuid: str
    activity_id: int
    is_inline: bool = True


async def create_inline_quiz(
    payload: InlineQuizCreate,
    current_user: PublicUser,
    db_session: Session,
) -> InlineQuizResponse:
    """Create a new inline quiz assessment linked to a parent activity.

    Idempotent: if an inline quiz already exists for this activity, returns it.
    """
    activity = db_session.exec(
        select(Activity).where(Activity.id == payload.activity_id)
    ).first()
    if activity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent activity not found",
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "course:update",
        resource_owner_id=activity.creator_id,
    )

    # Idempotency: check if inline quiz already exists for this activity
    existing = db_session.exec(
        select(Assessment).where(
            Assessment.inline_parent_activity_id == payload.activity_id,
            Assessment.is_inline,
        )
    ).first()
    if existing:
        return InlineQuizResponse(
            assessment_uuid=existing.assessment_uuid,
            activity_id=payload.activity_id,
        )

    now = datetime.now(UTC)

    # Create a lightweight hidden activity for the inline quiz.
    from src.db.courses.activities import ActivitySubTypeEnum, ActivityTypeEnum

    quiz_activity = Activity(
        name=payload.title,
        activity_type=ActivityTypeEnum.TYPE_CUSTOM,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_CUSTOM,
        content={},
        details={"lifecycle_status": "DRAFT"},
        settings={"kind": "INLINE_QUIZ"},
        published=False,
        chapter_id=activity.chapter_id,
        course_id=activity.course_id,
        order=0,  # inline quizzes don't appear in the outline
        creator_id=current_user.id,
        activity_uuid=f"activity_{ULID()}",
        creation_date=now,
        update_date=now,
    )
    db_session.add(quiz_activity)
    db_session.flush()

    # Create policy
    policy = AssessmentPolicy(
        policy_uuid=f"policy_{ULID()}",
        activity_id=quiz_activity.id,
        assessment_type=AssessmentType.QUIZ,
        grading_mode=AssessmentGradingMode.AUTO,
        grade_release_mode=GradeReleaseMode.IMMEDIATE,
        completion_rule=AssessmentCompletionRule.GRADED,
        passing_score=60.0,
        created_at=now,
        updated_at=now,
    )
    db_session.add(policy)
    db_session.flush()

    # Create assessment
    assessment = Assessment(
        assessment_uuid=f"assessment_{ULID()}",
        activity_id=quiz_activity.id,
        kind=AssessmentType.QUIZ,
        title=payload.title,
        lifecycle=AssessmentLifecycle.DRAFT,
        weight=0.0,  # inline quizzes don't affect course grade by default
        policy_id=policy.id,
        inline_parent_activity_id=payload.activity_id,
        is_inline=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(assessment)
    db_session.commit()
    db_session.refresh(assessment)

    return InlineQuizResponse(
        assessment_uuid=assessment.assessment_uuid,
        activity_id=payload.activity_id,
    )
