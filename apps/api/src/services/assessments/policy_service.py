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

from src.db.assessments import (
    StudentPolicyOverrideCreate,
    StudentPolicyOverrideRead,
    StudentPolicyOverrideUpdate,
)
from src.db.audit import AuditEventType
from src.db.grading.overrides import StudentPolicyOverride
from src.db.grading.progress import AssessmentPolicy
from src.db.users import PublicUser
from src.services.assessments._helpers import (
    _get_activity_and_course,
    _get_assessment_by_uuid_or_404,
    _require_grade,
)
from src.services.audit import record_audit_event
from src.types import require_persisted_id

logger = logging.getLogger(__name__)


def _reject_unsupported_time_limit_override(time_limit_override_seconds: int | None) -> None:
    if time_limit_override_seconds is None:
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={
            "code": "POLICY_OVERRIDE_FIELD_UNSUPPORTED",
            "field": "time_limit_override_seconds",
            "message": "Индивидуальный лимит времени будет включен в разделе доступности и льгот.",
        },
    )


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
        select(AssessmentPolicy).where(AssessmentPolicy.activity_id == assessment.activity_id)
    ).first()
    if policy is None:
        return []

    overrides = db_session.exec(select(StudentPolicyOverride).where(StudentPolicyOverride.policy_id == policy.id)).all()
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
        select(AssessmentPolicy).where(AssessmentPolicy.activity_id == assessment.activity_id)
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
    _reject_unsupported_time_limit_override(payload.time_limit_override_seconds)

    now = datetime.now(UTC)
    override = StudentPolicyOverride(
        policy_id=require_persisted_id(policy.id, model_name="AssessmentPolicy"),
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
            "due_at_override": payload.due_at_override.isoformat() if payload.due_at_override else None,
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
        select(AssessmentPolicy).where(AssessmentPolicy.activity_id == assessment.activity_id)
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
    _reject_unsupported_time_limit_override(payload.time_limit_override_seconds)

    changes = payload.model_dump(exclude_unset=True)
    changes.pop("time_limit_override_seconds", None)
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
        select(AssessmentPolicy).where(AssessmentPolicy.activity_id == assessment.activity_id)
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
        id=require_persisted_id(override.id, model_name="StudentPolicyOverride"),
        user_id=override.user_id,
        policy_id=override.policy_id,
        max_attempts_override=override.max_attempts_override,
        due_at_override=override.due_at_override,
        waive_late_penalty=override.waive_late_penalty,
        note=override.note,
        expires_at=override.expires_at,
        granted_by=override.granted_by,
    )
