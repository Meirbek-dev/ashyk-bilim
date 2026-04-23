import logging
from datetime import UTC, datetime

from fastapi import HTTPException, Request
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivityCreate,
    ActivityRead,
    ActivityReadWithPermissions,
    ActivityUpdate,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
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
            setattr(activity, field, value)

    activity.update_date = datetime.now(tz=UTC)

    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)

    try:
        from src.services.ai.cache_manager import get_ai_cache_manager

        get_ai_cache_manager().invalidate_activity_cache(activity_uuid)
    except Exception as _inv_err:
        logger.warning(
            "AI cache invalidation failed for %s: %s", activity_uuid, _inv_err
        )

    return ActivityRead.model_validate(activity)


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
    except Exception as _inv_err:
        logger.warning(
            "AI cache invalidation failed for %s: %s", activity_uuid, _inv_err
        )

    return {"detail": "Activity deleted"}


####################################################
# Misc
####################################################
