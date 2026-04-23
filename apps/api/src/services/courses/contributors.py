from datetime import datetime

from fastapi import HTTPException, Request, status
from sqlmodel import Session, and_, select

from src.db.courses.courses import Course
from src.db.resource_authors import (
    ResourceAuthor,
    ResourceAuthorshipEnum,
    ResourceAuthorshipStatusEnum,
)
from src.db.users import AnonymousUser, PublicUser, User, UserRead
from src.security.rbac import PermissionChecker
from src.services.courses._auth import require_course_permission


def _require_contributor_management(
    checker: PermissionChecker,
    current_user_id: int,
    course: Course,
    db_session: Session | None = None,
) -> None:
    checker.require(
        current_user_id,
        "course:update",
        resource_owner_id=course.creator_id,
    )


async def apply_course_contributor(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    """
    Apply to become a course contributor

    SECURITY NOTES:
    - Any authenticated user can apply to become a contributor
    - Applications are created with PENDING status
    - Only course owners (CREATOR, MAINTAINER) or admins can approve applications
    """
    # Verify user is not anonymous
    if current_user.id == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="You must be logged in to perform this action",
        )

    # Check if course exists
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Check if user already has any authorship role for this course
    existing_authorship = db_session.exec(
        select(ResourceAuthor).where(
            and_(
                ResourceAuthor.resource_uuid == course_uuid,
                ResourceAuthor.user_id == current_user.id,
            )
        )
    ).first()

    if existing_authorship:
        raise HTTPException(
            status_code=400,
            detail="You already have an authorship role for this course",
        )

    # Create pending contributor application
    resource_author = ResourceAuthor(
        resource_uuid=course_uuid,
        user_id=current_user.id,
        authorship=ResourceAuthorshipEnum.CONTRIBUTOR,
        authorship_status=ResourceAuthorshipStatusEnum.PENDING,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    db_session.add(resource_author)
    db_session.commit()
    db_session.refresh(resource_author)

    return {
        "detail": "Contributor application submitted successfully",
        "status": "pending",
    }


async def update_course_contributor(
    request: Request,
    course_uuid: str,
    contributor_user_id: int,
    authorship: ResourceAuthorshipEnum,
    authorship_status: ResourceAuthorshipStatusEnum,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    """
    Update a course contributor's role and status

    SECURITY NOTES:
    - Only course owners (CREATOR, MAINTAINER) or admins can update contributors
    - Cannot modify the role of the course creator
    - Requires strict course ownership checks
    """
    # Verify user is not anonymous
    if current_user.id == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="You must be logged in to perform this action",
        )

    # Check if course exists
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # SECURITY: Require the same contributor-management capability exposed by
    # the workspace rights endpoint.
    checker = PermissionChecker(db_session)
    _require_contributor_management(checker, current_user.id, course, db_session)

    # Check if the contributor exists for this course
    existing_authorship = db_session.exec(
        select(ResourceAuthor).where(
            and_(
                ResourceAuthor.resource_uuid == course_uuid,
                ResourceAuthor.user_id == contributor_user_id,
            )
        )
    ).first()

    if not existing_authorship:
        raise HTTPException(
            status_code=404,
            detail="Contributor not found for this course",
        )

    # SECURITY: Don't allow changing the role of the creator
    if existing_authorship.authorship == ResourceAuthorshipEnum.CREATOR:
        raise HTTPException(
            status_code=400,
            detail="Cannot modify the role of the course creator",
        )

    # Update the contributor's role and status
    existing_authorship.authorship = authorship
    existing_authorship.authorship_status = authorship_status
    existing_authorship.update_date = str(datetime.now())

    db_session.add(existing_authorship)
    db_session.commit()
    db_session.refresh(existing_authorship)

    return {"detail": "Contributor updated successfully", "status": "success"}


async def get_course_contributors(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[dict]:
    """
    Get all contributors for a course with their user information

    SECURITY NOTES:
    - Requires read access to the course
    - Contributors are visible to anyone with course read access
    """
    # Check if course exists
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # SECURITY: Require read access to the course
    checker = PermissionChecker(db_session)
    if not course.public:
        require_course_permission("course:read", current_user, course, checker)

    # Get all contributors for this course with user information
    statement = (
        select(ResourceAuthor, User)
        .join(User)  # SQLModel will automatically join on foreign key
        .where(ResourceAuthor.resource_uuid == course_uuid)
    )
    results = db_session.exec(statement).all()

    return [
        {
            "user_id": contributor.user_id,
            "authorship": contributor.authorship,
            "authorship_status": contributor.authorship_status,
            "creation_date": contributor.creation_date,
            "update_date": contributor.update_date,
            "user": UserRead.model_validate(user).model_dump(),
        }
        for contributor, user in results
    ]


async def add_bulk_course_contributors(
    request: Request,
    course_uuid: str,
    usernames: list[str],
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    """
    Add multiple contributors to a course by their usernames

    SECURITY NOTES:
    - Only course owners (CREATOR, MAINTAINER) or admins can add contributors
    - Requires strict course ownership checks
    - Cannot add contributors to courses the user doesn't own
    """
    # Verify user is not anonymous
    if current_user.id == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="You must be logged in to perform this action",
        )

    # Check if course exists
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # SECURITY: Require the same contributor-management capability exposed by
    # the workspace rights endpoint.
    checker = PermissionChecker(db_session)
    _require_contributor_management(checker, current_user.id, course)

    # Process results
    results = {"successful": [], "failed": []}

    current_time = str(datetime.now())

    # Pre-fetch all users and existing authorships in 2 batch queries
    user_map = {
        u.username: u
        for u in db_session.exec(select(User).where(User.username.in_(usernames))).all()
    }
    existing_user_ids = [u.id for u in user_map.values() if u.id is not None]
    existing_authorship_map = {
        ea.user_id: ea
        for ea in db_session.exec(
            select(ResourceAuthor).where(
                and_(
                    ResourceAuthor.resource_uuid == course_uuid,
                    ResourceAuthor.user_id.in_(existing_user_ids),
                )
            )
        ).all()
    }

    for username in usernames:
        try:
            user = user_map.get(username)

            if not user or user.id is None:
                results["failed"].append(
                    {"username": username, "reason": "User not found or invalid"}
                )
                continue

            # Check if user already has any authorship role for this course
            if user.id in existing_authorship_map:
                results["failed"].append(
                    {
                        "username": username,
                        "reason": "User already has an authorship role for this course",
                    }
                )
                continue

            # Create contributor
            resource_author = ResourceAuthor(
                resource_uuid=course_uuid,
                user_id=user.id,
                authorship=ResourceAuthorshipEnum.CONTRIBUTOR,
                authorship_status=ResourceAuthorshipStatusEnum.PENDING,
                creation_date=current_time,
                update_date=current_time,
            )

            db_session.add(resource_author)
            results["successful"].append({"username": username, "user_id": user.id})

        except Exception as e:
            results["failed"].append({"username": username, "reason": str(e)})

    if results["successful"]:
        db_session.commit()

    return results


async def remove_bulk_course_contributors(
    request: Request,
    course_uuid: str,
    usernames: list[str],
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
):
    """
    Remove multiple contributors from a course by their usernames

    SECURITY NOTES:
    - Only course owners (CREATOR, MAINTAINER) or admins can remove contributors
    - Requires strict course ownership checks
    - Cannot remove contributors from courses the user doesn't own
    - Cannot remove the course creator
    """
    # Verify user is not anonymous
    if current_user.id == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="You must be logged in to perform this action",
        )

    # Check if course exists
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # SECURITY: Require the same contributor-management capability exposed by
    # the workspace rights endpoint.
    checker = PermissionChecker(db_session)
    _require_contributor_management(checker, current_user.id, course)

    # Process results
    results = {"successful": [], "failed": []}

    # Pre-fetch all users and existing authorships in 2 batch queries
    user_map = {
        u.username: u
        for u in db_session.exec(select(User).where(User.username.in_(usernames))).all()
    }
    existing_user_ids = [u.id for u in user_map.values() if u.id is not None]
    existing_authorship_map = {
        ea.user_id: ea
        for ea in db_session.exec(
            select(ResourceAuthor).where(
                and_(
                    ResourceAuthor.resource_uuid == course_uuid,
                    ResourceAuthor.user_id.in_(existing_user_ids),
                )
            )
        ).all()
    }

    for username in usernames:
        try:
            user = user_map.get(username)

            if not user or user.id is None:
                results["failed"].append(
                    {"username": username, "reason": "User not found or invalid"}
                )
                continue

            # Check if user has any authorship role for this course
            existing_authorship = existing_authorship_map.get(user.id)

            if not existing_authorship:
                results["failed"].append(
                    {
                        "username": username,
                        "reason": "User is not a contributor for this course",
                    }
                )
                continue

            # SECURITY: Don't allow removing the creator
            if existing_authorship.authorship == ResourceAuthorshipEnum.CREATOR:
                results["failed"].append(
                    {"username": username, "reason": "Cannot remove the course creator"}
                )
                continue

            # Remove the contributor
            db_session.delete(existing_authorship)
            results["successful"].append({"username": username, "user_id": user.id})

        except Exception as e:
            results["failed"].append({"username": username, "reason": str(e)})

    if results["successful"]:
        db_session.commit()

    return results
