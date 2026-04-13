from collections import defaultdict
from datetime import UTC, datetime

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivityRead,
    ActivityReadWithPermissions,
)
from src.db.courses.chapters import (
    Chapter,
    ChapterCreateRequest,
    ChapterRead,
    ChapterReadWithPermissions,
    ChapterUpdate,
    ChapterUpdateOrder,
)
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses._auth import require_course_permission
from src.services.courses._utils import _next_activity_order


def _get_chapter_by_uuid(chapter_uuid: str, db_session) -> Chapter:
    statement = select(Chapter).where(Chapter.chapter_uuid == chapter_uuid)
    chapter = db_session.exec(statement).first()
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Chapter does not exist"
        )
    return chapter


def _get_course_for_chapter(chapter: Chapter, db_session: Session) -> Course:
    course = db_session.exec(
        select(Course).where(Course.id == chapter.course_id)
    ).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course does not exist"
        )
    return course


def _next_chapter_order(course_id: int, db_session: Session) -> int:
    result = db_session.exec(
        select(Chapter)
        .where(Chapter.course_id == course_id)
        .order_by(Chapter.order.desc())
    ).first()
    return (result.order if result else 0) + 1


####################################################
# CRUD
####################################################


async def create_chapter(
    request: Request,
    chapter_object: ChapterCreateRequest,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ChapterRead:
    course = db_session.exec(
        select(Course).where(Course.course_uuid == chapter_object.course_uuid)
    ).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course does not exist"
        )

    checker = PermissionChecker(db_session)
    require_course_permission("chapter:create", current_user, course, checker)

    chapter = Chapter(
        name=chapter_object.name,
        description=chapter_object.description or "",
        thumbnail_image=chapter_object.thumbnail_image or "",
        course_id=course.id,
    )
    chapter.chapter_uuid = f"chapter_{ULID()}"
    chapter.creation_date = datetime.now(tz=UTC)
    chapter.update_date = datetime.now(tz=UTC)
    chapter.creator_id = current_user.id
    chapter.order = _next_chapter_order(course.id, db_session)

    db_session.add(chapter)
    db_session.commit()
    db_session.refresh(chapter)

    return ChapterRead.model_validate(chapter, update={"activities": []})


async def get_chapter(
    request: Request,
    chapter_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ChapterRead:
    chapter = _get_chapter_by_uuid(chapter_uuid, db_session)
    course = _get_course_for_chapter(chapter, db_session)

    checker = PermissionChecker(db_session)
    require_course_permission("course:read", current_user, course, checker)

    activities = db_session.exec(
        select(Activity)
        .where(Activity.chapter_id == chapter.id)
        .order_by(Activity.order)
    ).all()

    return ChapterRead.model_validate(
        chapter,
        update={"activities": [ActivityRead.model_validate(a) for a in activities]},
    )


async def update_chapter(
    request: Request,
    chapter_object: ChapterUpdate,
    chapter_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ChapterRead:
    chapter = _get_chapter_by_uuid(chapter_uuid, db_session)

    course = _get_course_for_chapter(chapter, db_session)
    checker = PermissionChecker(db_session)
    require_course_permission("chapter:update", current_user, course, checker)

    update_data = chapter_object.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(chapter, field, value)

    chapter.update_date = datetime.now(tz=UTC)
    db_session.commit()
    db_session.refresh(chapter)

    activities = db_session.exec(
        select(Activity)
        .where(Activity.chapter_id == chapter.id)
        .order_by(Activity.order)
    ).all()

    return ChapterRead.model_validate(
        chapter,
        update={"activities": [ActivityRead.model_validate(a) for a in activities]},
    )


async def delete_chapter(
    request: Request,
    chapter_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    chapter = _get_chapter_by_uuid(chapter_uuid, db_session)

    course = _get_course_for_chapter(chapter, db_session)
    checker = PermissionChecker(db_session)
    require_course_permission("chapter:delete", current_user, course, checker)

    # Activities cascade via FK (chapter_id → chapter.id ON DELETE CASCADE)
    db_session.delete(chapter)
    db_session.commit()

    return {"detail": "chapter deleted"}


async def move_chapter_to_order(
    request: Request,
    chapter_uuid: str,
    position: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ChapterRead:
    """Move a chapter to a new position within its course."""
    chapter = _get_chapter_by_uuid(chapter_uuid, db_session)
    course = _get_course_for_chapter(chapter, db_session)

    checker = PermissionChecker(db_session)
    require_course_permission("chapter:update", current_user, course, checker)

    siblings = db_session.exec(
        select(Chapter)
        .where(Chapter.course_id == chapter.course_id)
        .where(Chapter.id != chapter.id)
        .order_by(Chapter.order)
    ).all()

    # Clamp position to the valid range [1, total_chapters].
    new_order = max(1, min(position, len(siblings) + 1))

    # Re-number siblings excluding the moved chapter, skipping new_order.
    cursor = 1
    for sib in siblings:
        if cursor == new_order:
            cursor += 1
        sib.order = cursor
        cursor += 1

    chapter.order = new_order
    db_session.commit()
    db_session.refresh(chapter)

    return await get_chapter(request, chapter.chapter_uuid, current_user, db_session)


async def move_activity_to_order(
    request: Request,
    activity_uuid: str,
    position: int,
    target_chapter_uuid: str | None,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    """Move an activity to a new position, optionally into a different chapter."""
    activity = db_session.exec(
        select(Activity).where(Activity.activity_uuid == activity_uuid)
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Resolve source chapter and its course for permission check.
    source_chapter = _get_chapter_by_uuid(
        db_session.exec(select(Chapter).where(Chapter.id == activity.chapter_id))
        .first()
        .chapter_uuid,
        db_session,
    )
    source_course = _get_course_for_chapter(source_chapter, db_session)

    checker = PermissionChecker(db_session)
    require_course_permission("activity:update", current_user, source_course, checker)

    if target_chapter_uuid:
        target_chapter = _get_chapter_by_uuid(target_chapter_uuid, db_session)
        # If moving to a different course, verify permission on that course too.
        if target_chapter.course_id != source_course.id:
            target_course = _get_course_for_chapter(target_chapter, db_session)
            require_course_permission(
                "chapter:update", current_user, target_course, checker
            )
        activity.chapter_id = target_chapter.id
        # Sync the denormalized FK.
        activity.course_id = target_chapter.course_id
    else:
        target_chapter = source_chapter

    siblings = db_session.exec(
        select(Activity)
        .where(Activity.chapter_id == activity.chapter_id)
        .where(Activity.id != activity.id)
        .order_by(Activity.order)
    ).all()

    # Clamp position to the valid range [1, total_activities].
    new_order = max(1, min(position, len(siblings) + 1))

    cursor = 1
    for sib in siblings:
        if cursor == new_order:
            cursor += 1
        sib.order = cursor
        cursor += 1

    activity.order = new_order
    db_session.commit()
    return {"detail": "activity moved"}


async def get_course_chapters(
    request: Request,
    course_id: int,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    with_unpublished_activities: bool,
    page: int = 1,
    limit: int = 10,
) -> list[ChapterReadWithPermissions]:
    course = db_session.exec(select(Course).where(Course.id == course_id)).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course does not exist"
        )

    checker = PermissionChecker(db_session)
    if not course.public:
        checker.require(current_user.id, "course:read")

    chapters = db_session.exec(
        select(Chapter).where(Chapter.course_id == course_id).order_by(Chapter.order)
    ).all()

    chapter_reads = [
        ChapterReadWithPermissions.model_validate(chapter, update={"activities": []})
        for chapter in chapters
    ]

    if not chapter_reads:
        return chapter_reads

    chapter_ids = [c.id for c in chapter_reads]

    # Apply the published filter in SQL, not in Python.
    activity_query = (
        select(Activity)
        .where(Activity.chapter_id.in_(chapter_ids))
        .order_by(Activity.order)
    )
    if not with_unpublished_activities:
        activity_query = activity_query.where(Activity.published == True)  # noqa: E712

    activities = db_session.exec(activity_query).all()

    activities_by_chapter: dict[int, list[Activity]] = defaultdict(list)
    for activity in activities:
        if activity.chapter_id is not None:
            activities_by_chapter[activity.chapter_id].append(activity)

    for chapter in chapter_reads:
        for activity in activities_by_chapter.get(chapter.id, []):
            can_update = checker.check(
                current_user.id,
                "activity:update",
                resource_owner_id=activity.creator_id,
            )
            can_delete = checker.check(
                current_user.id,
                "activity:delete",
                resource_owner_id=activity.creator_id,
            )
            is_owner = activity.creator_id == current_user.id

            chapter.activities.append(
                ActivityReadWithPermissions(
                    **ActivityRead.model_validate(activity).model_dump(),
                    can_update=can_update,
                    can_delete=can_delete,
                    is_owner=is_owner,
                    is_creator=is_owner,
                )
            )

    return chapter_reads


async def reorder_chapters_and_activities(
    request: Request,
    course_uuid: str,
    chapters_order: ChapterUpdateOrder,
    current_user: PublicUser,
    db_session: Session,
):
    """Bulk reorder all chapters and activities in a course (used by drag-and-drop)."""
    course = db_session.exec(
        select(Course).where(Course.course_uuid == course_uuid)
    ).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course does not exist"
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id, "chapter:update", resource_owner_id=course.creator_id
    )

    # Optimistic-concurrency guard.
    if chapters_order.last_known_update_date is not None:
        from src.services.courses.courses import _ensure_course_is_current

        _ensure_course_is_current(course, chapters_order.last_known_update_date)

    # --- Resolve all chapter UUIDs in the payload ---
    payload_chapter_uuids = {
        co.chapter_uuid for co in chapters_order.chapter_order_by_uuids
    }

    # All chapters that actually belong to this course.
    db_chapters = db_session.exec(
        select(Chapter).where(Chapter.course_id == course.id)
    ).all()
    db_chapter_uuids = {c.chapter_uuid for c in db_chapters}
    chapters_by_uuid = {c.chapter_uuid: c for c in db_chapters}

    # Reject if the payload is missing any existing chapters or includes unknown ones.
    missing = db_chapter_uuids - payload_chapter_uuids
    unknown = payload_chapter_uuids - db_chapter_uuids
    if missing or unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Payload does not match the current course structure. "
                "Reload and try again.",
                "missing_chapters": sorted(missing),
                "unknown_chapters": sorted(unknown),
            },
        )

    # --- Resolve all activity UUIDs ---
    payload_activity_uuids: set[str] = set()
    for co in chapters_order.chapter_order_by_uuids:
        payload_activity_uuids.update(co.activities_order_by_uuids)

    # Duplicate check within the payload.
    all_activity_uuids_flat = [
        uuid
        for co in chapters_order.chapter_order_by_uuids
        for uuid in co.activities_order_by_uuids
    ]
    if len(all_activity_uuids_flat) != len(payload_activity_uuids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Duplicate activity UUIDs detected in the payload.",
        )

    db_activities = db_session.exec(
        select(Activity).where(Activity.course_id == course.id)
    ).all()
    db_activity_uuids = {a.activity_uuid for a in db_activities}
    activities_by_uuid = {a.activity_uuid: a for a in db_activities}

    missing_acts = db_activity_uuids - payload_activity_uuids
    unknown_acts = payload_activity_uuids - db_activity_uuids
    if missing_acts or unknown_acts:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "Payload does not match the current course activities. "
                "Reload and try again.",
                "missing_activities": sorted(missing_acts),
                "unknown_activities": sorted(unknown_acts),
            },
        )

    # --- Apply the new order ---
    now = datetime.now(tz=UTC)

    for index, chapter_order in enumerate(chapters_order.chapter_order_by_uuids):
        chapter = chapters_by_uuid[chapter_order.chapter_uuid]
        chapter.order = index + 1
        chapter.update_date = now

    for chapter_order in chapters_order.chapter_order_by_uuids:
        chapter = chapters_by_uuid[chapter_order.chapter_uuid]
        for index, activity_uuid in enumerate(chapter_order.activities_order_by_uuids):
            activity = activities_by_uuid[activity_uuid]
            activity.chapter_id = chapter.id
            # Keep denormalized FK in sync.
            activity.course_id = course.id
            activity.order = index + 1

    # Bump course update_date so the next request's concurrency check is valid.
    course.update_date = now
    db_session.commit()

    return {"detail": "Chapters and activities reordered successfully"}
