from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import and_, or_, select
from sqlmodel import Session

from src.db.assessments import Assessment
from src.db.courses.activities import Activity, ActivityTypeEnum
from src.db.courses.courses import Course
from src.db.resource_authors import ResourceAuthor, ResourceAuthorshipStatusEnum
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import (
    AuthenticationRequired,
    PermissionChecker,
    PermissionDenied,
)
from src.services.analytics.filters import AnalyticsFilters


@dataclass(slots=True)
class TeacherAnalyticsScope:
    teacher_user_id: int
    course_ids: list[int]
    cohort_ids: list[int]
    has_platform_scope: bool


def _coerce_course_id(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if hasattr(value, "_mapping"):
        mapping = value._mapping
        if mapping:
            return _coerce_course_id(next(iter(mapping.values())))
    if isinstance(value, (tuple, list)):
        if not value:
            return None
        return _coerce_course_id(value[0])
    return int(value)


def _has_analytics_scope(
    checker: PermissionChecker, user_id: int, action: str, scope: str
) -> bool:
    permissions = checker.get_expanded_permissions(user_id)
    return (
        f"analytics:{action}:{scope}" in permissions
        or f"analytics:*:{scope}" in permissions
        or "*:*:*" in permissions
    )


def ensure_analytics_access(
    checker: PermissionChecker, user_id: int, action: str
) -> None:
    if any(
        _has_analytics_scope(checker, user_id, action, scope)
        for scope in ("assigned", "platform", "all")
    ):
        return
    raise PermissionDenied(permission=f"analytics:{action}")


def resolve_teacher_scope(
    db_session: Session,
    checker: PermissionChecker,
    current_user: PublicUser | AnonymousUser,
    filters: AnalyticsFilters,
    *,
    action: str,
) -> TeacherAnalyticsScope:
    if isinstance(current_user, AnonymousUser):
        raise AuthenticationRequired

    ensure_analytics_access(checker, current_user.id, action)
    has_platform_scope = any(
        _has_analytics_scope(checker, current_user.id, action, scope)
        for scope in ("platform", "all")
    )

    teacher_user_id = filters.teacher_user_id or current_user.id
    target_user_id = teacher_user_id if has_platform_scope else current_user.id

    if has_platform_scope and filters.teacher_user_id:
        course_ids = db_session.exec(
            select(Course.id)
            .outerjoin(
                ResourceAuthor, ResourceAuthor.resource_uuid == Course.course_uuid
            )
            .where(
                or_(
                    Course.creator_id == target_user_id,
                    and_(
                        ResourceAuthor.user_id == target_user_id,
                        ResourceAuthor.authorship_status
                        == ResourceAuthorshipStatusEnum.ACTIVE,
                    ),
                )
            )
        ).all()
    elif has_platform_scope:
        course_ids = db_session.exec(select(Course.id)).all()
    else:
        course_ids = db_session.exec(
            select(Course.id)
            .outerjoin(
                ResourceAuthor, ResourceAuthor.resource_uuid == Course.course_uuid
            )
            .where(
                or_(
                    Course.creator_id == current_user.id,
                    and_(
                        ResourceAuthor.user_id == current_user.id,
                        ResourceAuthor.authorship_status
                        == ResourceAuthorshipStatusEnum.ACTIVE,
                    ),
                )
            )
        ).all()

    normalized_course_ids = sorted({
        normalized_course_id
        for course_id in course_ids
        if (normalized_course_id := _coerce_course_id(course_id)) is not None
    })
    if filters.course_ids:
        requested = set(filters.course_ids)
        allowed = set(normalized_course_ids)
        unauthorized = sorted(requested - allowed)
        if unauthorized:
            raise PermissionDenied(
                permission=f"analytics:{action}",
                reason=f"Запрошенные курсы находятся вне разрешенной области аналитики: {unauthorized}",
            )
        normalized_course_ids = sorted(requested)

    return TeacherAnalyticsScope(
        teacher_user_id=target_user_id,
        course_ids=normalized_course_ids,
        cohort_ids=filters.cohort_ids,
        has_platform_scope=has_platform_scope,
    )


def ensure_course_in_scope(scope: TeacherAnalyticsScope, course_id: int) -> None:
    if course_id not in scope.course_ids:
        raise PermissionDenied(
            permission="analytics:read",
            reason=f"Курс {course_id} находится вне разрешенной области аналитики",
        )


def resolve_course_id_for_assessment(
    db_session: Session,
    assessment_type: str,
    assessment_id: int,
) -> int | None:
    if assessment_type in {"assignment", "exam"}:
        row = db_session.exec(
            select(Assessment, Activity)
            .join(Activity, Activity.id == Assessment.activity_id)
            .where(Assessment.id == assessment_id)
        ).first()
        if row is None:
            return None
        if hasattr(row, "_mapping"):
            activity = next(
                value for value in row._mapping.values() if isinstance(value, Activity)
            )
        else:
            activity = row[1]
        return activity.course_id
    if assessment_type in {"quiz", "code_challenge"}:
        activity = db_session.exec(
            select(Activity).where(Activity.id == assessment_id)
        ).first()
        if activity is None or activity.course_id is None:
            return None
        if (
            assessment_type == "quiz"
            and activity.activity_type != ActivityTypeEnum.TYPE_QUIZ
        ):
            return None
        if (
            assessment_type == "code_challenge"
            and activity.activity_type != ActivityTypeEnum.TYPE_CODE_CHALLENGE
        ):
            return None
        return activity.course_id
    return None


def ensure_assessment_in_scope(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    assessment_type: str,
    assessment_id: int,
) -> None:
    course_id = resolve_course_id_for_assessment(
        db_session, assessment_type, assessment_id
    )
    if course_id is None:
        raise PermissionDenied(
            permission="analytics:read",
            reason=f"Оценивание {assessment_type}:{assessment_id} не найдено",
        )
    ensure_course_in_scope(scope, course_id)
