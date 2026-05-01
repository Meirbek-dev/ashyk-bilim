import logging
from datetime import UTC, datetime

from fastapi import HTTPException, Request
from sqlmodel import Session, select
from ulid import ULID

from src.db.assessments import Assessment, AssessmentLifecycle
from src.db.courses.activities import (
    Activity,
    ActivityAssessmentPolicyRead,
    ActivityCreate,
    ActivityRead,
    ActivityReadWithPermissions,
    ActivityTypeEnum,
    ActivityUpdate,
    AssessmentLifecycleStatus,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.progress import AssessmentPolicy
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses._auth import require_course_permission
from src.services.courses._utils import _next_activity_order

logger = logging.getLogger(__name__)


def _normalize_activity_uuid(activity_uuid: str) -> str:
    if activity_uuid.startswith("activity_"):
        return activity_uuid
    return f"activity_{activity_uuid}"


def _get_activity_by_uuid(activity_uuid: str, db_session: Session) -> Activity:
    normalized_uuid = _normalize_activity_uuid(activity_uuid)
    activity = db_session.exec(
        select(Activity).where(Activity.activity_uuid == normalized_uuid)
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


def _get_course_for_activity(activity: Activity, db_session: Session) -> Course:
    """Resolve course from activity via chapter."""
    if activity.chapter_id:
        chapter = db_session.exec(
            select(Chapter).where(Chapter.id == activity.chapter_id)
        ).first()
        if chapter:
            course = db_session.exec(
                select(Course).where(Course.id == chapter.course_id)
            ).first()
            if course:
                return course
    raise HTTPException(status_code=404, detail="Course not found")


####################################################
# CRUD
####################################################


async def create_activity(
    request: Request,
    activity_object: ActivityCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    chapter = db_session.exec(
        select(Chapter).where(Chapter.id == activity_object.chapter_id)
    ).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    course = db_session.exec(
        select(Course).where(Course.id == chapter.course_id)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    checker = PermissionChecker(db_session)
    require_course_permission("activity:create", current_user, course, checker)

    activity = Activity(**activity_object.model_dump())
    activity.activity_uuid = f"activity_{ULID()}"
    activity.creation_date = datetime.now(tz=UTC)
    activity.update_date = datetime.now(tz=UTC)
    activity.chapter_id = activity_object.chapter_id
    # Populate the denormalized FK so queries on activity.course_id stay valid.
    activity.course_id = course.id
    activity.creator_id = current_user.id
    activity.order = _next_activity_order(activity_object.chapter_id, db_session)

    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    return ActivityRead.model_validate(activity)


async def get_activity(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    activity = _get_activity_by_uuid(activity_uuid, db_session)
    course = _get_course_for_activity(activity, db_session)

    checker = PermissionChecker(db_session)

    # For public courses, guests can read published activities.
    # Otherwise, require explicit activity:read permission.
    is_public_and_published = course.public and activity.published
    if not is_public_and_published:
        checker.require(
            current_user.id, "activity:read", resource_owner_id=activity.creator_id
        )

    activity_read = ActivityRead.model_validate(activity)

    can_update = checker.check(
        current_user.id, "activity:update", resource_owner_id=activity.creator_id
    )
    can_delete = checker.check(
        current_user.id, "activity:delete", resource_owner_id=activity.creator_id
    )
    is_owner = activity.creator_id == current_user.id

    return ActivityReadWithPermissions(
        **activity_read.model_dump(),
        can_update=can_update,
        can_delete=can_delete,
        is_owner=is_owner,
        is_creator=is_owner,
        assessment_policy=_get_activity_policy_read(activity, db_session),
    )


def _get_activity_policy_read(
    activity: Activity,
    db_session: Session,
) -> ActivityAssessmentPolicyRead | None:
    if activity.id is None:
        return None
    policy = db_session.exec(
        select(AssessmentPolicy).where(AssessmentPolicy.activity_id == activity.id)
    ).first()
    if policy is None:
        return None
    return ActivityAssessmentPolicyRead(
        id=policy.id or 0,
        policy_uuid=policy.policy_uuid,
        assessment_type=str(policy.assessment_type),
        max_attempts=policy.max_attempts,
        time_limit_seconds=policy.time_limit_seconds,
        due_at=policy.due_at,
        late_policy_json=policy.late_policy_json,
        anti_cheat_json=policy.anti_cheat_json,
        settings_json=policy.settings_json,
    )


async def update_activity(
    request: Request,
    activity_object: ActivityUpdate,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    activity = _get_activity_by_uuid(activity_uuid, db_session)

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "activity:update", resource_owner_id=activity.creator_id
    )

    update_data = activity_object.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            if field == "details" and isinstance(value, dict):
                activity.details = {
                    **(activity.details or {}),
                    **value,
                }
            else:
                setattr(activity, field, value)

    _sync_assessment_lifecycle(activity, update_data, db_session)

    activity.update_date = datetime.now(tz=UTC)

    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    try:
        from src.services.ai.cache_manager import get_ai_cache_manager

        get_ai_cache_manager().invalidate_activity_cache(activity_uuid)
    except Exception as inv_err:  # noqa: BLE001
        logger.warning(
            "AI cache invalidation failed for %s: %s", activity_uuid, inv_err
        )

    return ActivityRead.model_validate(activity)


def _sync_assessment_lifecycle(
    activity: Activity,
    update_data: dict[str, object],
    db_session: Session,
) -> None:
    if activity.activity_type not in {
        ActivityTypeEnum.TYPE_ASSIGNMENT,
        ActivityTypeEnum.TYPE_EXAM,
        ActivityTypeEnum.TYPE_CODE_CHALLENGE,
    }:
        return

    details = activity.details if isinstance(activity.details, dict) else {}
    lifecycle_raw = details.get("lifecycle_status")
    now = datetime.now(tz=UTC).isoformat()

    if lifecycle_raw is None and "published" in update_data:
        lifecycle_raw = (
            AssessmentLifecycleStatus.PUBLISHED.value
            if activity.published
            else AssessmentLifecycleStatus.DRAFT.value
        )

    if lifecycle_raw is None:
        return

    try:
        lifecycle = AssessmentLifecycleStatus(str(lifecycle_raw))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid lifecycle_status")

    details["lifecycle_status"] = lifecycle.value
    if lifecycle == AssessmentLifecycleStatus.PUBLISHED:
        activity.published = True
        details["published_at"] = details.get("published_at") or now
        details["scheduled_at"] = None
    elif lifecycle == AssessmentLifecycleStatus.SCHEDULED:
        activity.published = False
    elif lifecycle == AssessmentLifecycleStatus.ARCHIVED:
        activity.published = False
        details["archived_at"] = details.get("archived_at") or now
        details["scheduled_at"] = None
    else:
        activity.published = False
        details["scheduled_at"] = None

    activity.details = details

    if activity.id is not None:
        assessment = db_session.exec(
            select(Assessment).where(Assessment.activity_id == activity.id)
        ).first()
        if assessment is not None:
            assessment.lifecycle = AssessmentLifecycle(lifecycle.value)
            assessment.published_at = (
                datetime.now(tz=UTC)
                if lifecycle == AssessmentLifecycleStatus.PUBLISHED
                else assessment.published_at
            )
            assessment.scheduled_at = (
                _coerce_datetime(details.get("scheduled_at"))
                if lifecycle == AssessmentLifecycleStatus.SCHEDULED
                else None
            )
            assessment.archived_at = (
                datetime.now(tz=UTC)
                if lifecycle == AssessmentLifecycleStatus.ARCHIVED
                else assessment.archived_at
            )
            db_session.add(assessment)


def _coerce_datetime(value: object) -> datetime | None:
    if value is None or not isinstance(value, str) or not value:
        return None
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


async def delete_activity(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    activity = _get_activity_by_uuid(activity_uuid, db_session)

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "activity:delete", resource_owner_id=activity.creator_id
    )

    db_session.delete(activity)
    db_session.commit()

    try:
        from src.services.ai.cache_manager import get_ai_cache_manager

        get_ai_cache_manager().invalidate_activity_cache(activity_uuid)
    except Exception as inv_err:  # noqa: BLE001
        logger.warning(
            "AI cache invalidation failed for %s: %s", activity_uuid, inv_err
        )

    return {"detail": "Activity deleted"}


####################################################
# Misc
####################################################
