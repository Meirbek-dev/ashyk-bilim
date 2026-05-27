"""Assessment policy service — policy CRUD and student overrides.

Extracted from core.py. Handles:
- Policy preset retrieval
- Student policy override CRUD (create, update, delete, list)
- Policy resolution with overrides
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.assessments import (
    AssessmentPolicyPreset,
    StudentPolicyOverrideCreate,
    StudentPolicyOverrideRead,
    StudentPolicyOverrideUpdate,
)
from src.db.audit import AuditEventType
from src.db.grading.overrides import StudentPolicyOverride
from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    GradeReleaseMode,
)
from src.db.grading.submissions import AssessmentType
from src.db.users import PublicUser
from src.security.rbac import PermissionChecker
from src.services.assessments._helpers import (
    _get_activity_and_course,
    _get_assessment_by_uuid_or_404,
    _require_grade,
)
from src.services.audit import record_audit_event

logger = logging.getLogger(__name__)


def get_policy_preset(kind: AssessmentType) -> AssessmentPolicyPreset:
    """Return default policy settings for a given assessment kind."""
    presets: dict[AssessmentType, AssessmentPolicyPreset] = {
        AssessmentType.QUIZ: AssessmentPolicyPreset(
            kind=AssessmentType.QUIZ,
            grade_release_mode=GradeReleaseMode.IMMEDIATE,
            grading_mode=AssessmentGradingMode.AUTO,
            completion_rule=AssessmentCompletionRule.GRADED,
            passing_score=60.0,
            max_attempts=None,
            time_limit_seconds=None,
            allow_late=True,
            anti_cheat_enabled=False,
            review_visibility="FULL",
        ),
        AssessmentType.EXAM: AssessmentPolicyPreset(
            kind=AssessmentType.EXAM,
            grade_release_mode=GradeReleaseMode.BATCH,
            grading_mode=AssessmentGradingMode.AUTO,
            completion_rule=AssessmentCompletionRule.GRADED,
            passing_score=60.0,
            max_attempts=1,
            time_limit_seconds=3600,
            allow_late=False,
            anti_cheat_enabled=True,
            review_visibility="SCORE_ONLY",
        ),
        AssessmentType.CODE_CHALLENGE: AssessmentPolicyPreset(
            kind=AssessmentType.CODE_CHALLENGE,
            grade_release_mode=GradeReleaseMode.IMMEDIATE,
            grading_mode=AssessmentGradingMode.AUTO,
            completion_rule=AssessmentCompletionRule.PASSED,
            passing_score=60.0,
            max_attempts=None,
            time_limit_seconds=None,
            allow_late=True,
            anti_cheat_enabled=False,
            review_visibility="FULL",
        ),
    }
    if kind not in presets:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Предустановка политики оценивания не найдена",
        )
    return presets[kind]


async def list_student_policy_overrides(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list[StudentPolicyOverrideRead]:
    """List all per-student overrides for an assessment."""
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)

    policy = db_session.exec(
        select(AssessmentPolicy).where(
            AssessmentPolicy.activity_id == assessment.activity_id
        )
    ).first()
    if policy is None:
        return []

    overrides = db_session.exec(
        select(StudentPolicyOverride).where(
            StudentPolicyOverride.policy_id == policy.id
        )
    ).all()
    return [_build_override_read(o) for o in overrides]


async def create_student_policy_override(
    assessment_uuid: str,
    payload: StudentPolicyOverrideCreate,
    current_user: PublicUser,
    db_session: Session,
) -> StudentPolicyOverrideRead:
    """Create a per-student policy exception."""
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)

    policy = db_session.exec(
        select(AssessmentPolicy).where(
            AssessmentPolicy.activity_id == assessment.activity_id
        )
    ).first()
    if policy is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Политика оценивания не найдена",
        )

    # Check for existing override
    existing = db_session.exec(
        select(StudentPolicyOverride).where(
            StudentPolicyOverride.policy_id == policy.id,
            StudentPolicyOverride.user_id == payload.user_id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Исключение для этого студента уже существует",
        )

    now = datetime.now(UTC)
    override = StudentPolicyOverride(
        policy_id=policy.id,
        user_id=payload.user_id,
        max_attempts_override=payload.max_attempts_override,
        due_at_override=payload.due_at_override,
        waive_late_penalty=payload.waive_late_penalty,
        note=payload.note,
        expires_at=payload.expires_at,
        granted_by=current_user.id,
        created_at=now,
        updated_at=now,
    )
    db_session.add(override)

    record_audit_event(
        db_session,
        actor_id=current_user.id,
        event_type=AuditEventType.POLICY_OVERRIDE_CREATED,
        target_kind="override",
        target_uuid=assessment_uuid,
        payload={
            "user_id": payload.user_id,
            "max_attempts_override": payload.max_attempts_override,
            "due_at_override": payload.due_at_override.isoformat()
            if payload.due_at_override
            else None,
            "waive_late_penalty": payload.waive_late_penalty,
        },
    )

    db_session.commit()
    db_session.refresh(override)
    return _build_override_read(override)


async def update_student_policy_override(
    assessment_uuid: str,
    user_id: int,
    payload: StudentPolicyOverrideUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> StudentPolicyOverrideRead:
    """Update an existing per-student policy override."""
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)

    policy = db_session.exec(
        select(AssessmentPolicy).where(
            AssessmentPolicy.activity_id == assessment.activity_id
        )
    ).first()
    if policy is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Политика оценивания не найдена",
        )

    override = db_session.exec(
        select(StudentPolicyOverride).where(
            StudentPolicyOverride.policy_id == policy.id,
            StudentPolicyOverride.user_id == user_id,
        )
    ).first()
    if override is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Исключение не найдено",
        )

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(override, field, value)
    override.updated_at = datetime.now(UTC)

    record_audit_event(
        db_session,
        actor_id=current_user.id,
        event_type=AuditEventType.POLICY_OVERRIDE_UPDATED,
        target_kind="override",
        target_uuid=assessment_uuid,
        payload={"user_id": user_id, "changes": changes},
    )

    db_session.add(override)
    db_session.commit()
    db_session.refresh(override)
    return _build_override_read(override)


async def delete_student_policy_override(
    assessment_uuid: str,
    user_id: int,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, str]:
    """Delete a per-student policy override."""
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)

    policy = db_session.exec(
        select(AssessmentPolicy).where(
            AssessmentPolicy.activity_id == assessment.activity_id
        )
    ).first()
    if policy is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Политика оценивания не найдена",
        )

    override = db_session.exec(
        select(StudentPolicyOverride).where(
            StudentPolicyOverride.policy_id == policy.id,
            StudentPolicyOverride.user_id == user_id,
        )
    ).first()
    if override is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Исключение не найдено",
        )

    record_audit_event(
        db_session,
        actor_id=current_user.id,
        event_type=AuditEventType.POLICY_OVERRIDE_DELETED,
        target_kind="override",
        target_uuid=assessment_uuid,
        payload={"user_id": user_id},
    )

    db_session.delete(override)
    db_session.commit()
    return {"detail": "Исключение удалено"}


def _build_override_read(override: StudentPolicyOverride) -> StudentPolicyOverrideRead:
    return StudentPolicyOverrideRead(
        id=override.id,
        user_id=override.user_id,
        policy_id=override.policy_id,
        max_attempts_override=override.max_attempts_override,
        due_at_override=override.due_at_override,
        waive_late_penalty=override.waive_late_penalty,
        note=override.note,
        expires_at=override.expires_at,
        granted_by=override.granted_by,
    )
