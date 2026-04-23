from datetime import datetime

from fastapi import HTTPException, Request, status
from sqlmodel import Session, col, select
from ulid import ULID

from src.db.courses.course_updates import (
    CourseUpdate,
    CourseUpdateCreate,
    CourseUpdateRead,
    CourseUpdateUpdate,
)
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses._auth import require_course_permission


async def create_update(
    request: Request,
    course_uuid: str,
    update_object: CourseUpdateCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> CourseUpdateRead:
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course or course.id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Course does not exist"
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    require_course_permission("course:update", current_user, course, checker)

    # Generate UUID
    courseupdate_uuid = f"courseupdate_{ULID()}"

    update = CourseUpdate(
        **update_object.model_dump(),
        course_id=course.id,
        courseupdate_uuid=courseupdate_uuid,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    db_session.add(update)

    db_session.commit()
    db_session.refresh(update)

    return CourseUpdateRead(**update.model_dump())


# Update Course Update
async def update_update(
    request: Request,
    courseupdate_uuid: str,
    update_object: CourseUpdateUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> CourseUpdateRead:
    statement = select(CourseUpdate).where(
        CourseUpdate.courseupdate_uuid == courseupdate_uuid
    )
    update = db_session.exec(statement).first()

    if not update or update.id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Update does not exist"
        )
    # RBAC check
    checker = PermissionChecker(db_session)
    update_course = (
        db_session.get(Course, update.course_id) if update.course_id else None
    )
    if not update_course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )
    require_course_permission("course:update", current_user, update_course, checker)

    for key, value in update_object.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(update, key, value)

    db_session.add(update)

    db_session.commit()
    db_session.refresh(update)

    return CourseUpdateRead(**update.model_dump())


# Delete Course Update
async def delete_update(
    request: Request,
    courseupdate_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    statement = select(CourseUpdate).where(
        CourseUpdate.courseupdate_uuid == courseupdate_uuid
    )
    update = db_session.exec(statement).first()

    if not update or update.id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Update does not exist"
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    update_course = (
        db_session.get(Course, update.course_id) if update.course_id else None
    )
    checker.require(
        current_user.id,
        "course:update",
        resource_owner_id=update_course.creator_id if update_course else None,
    )

    db_session.delete(update)
    db_session.commit()

    return {"message": "Update deleted successfully"}


# Get Course Updates by Course ID
async def get_updates_by_course_uuid(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[CourseUpdateRead]:
    # FInd if course exists
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course or course.id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Course does not exist"
        )

    statement = (
        select(CourseUpdate)
        .where(CourseUpdate.course_id == course.id)
        .order_by(col(CourseUpdate.creation_date).desc())
    )  # https://sqlmodel.tiangolo.com/tutorial/where/#type-annotations-and-errors
    updates = db_session.exec(statement).all()

    return [CourseUpdateRead(**update.model_dump()) for update in updates]
