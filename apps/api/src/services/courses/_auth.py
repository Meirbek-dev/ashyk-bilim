"""Shared permission guards for course / chapter / activity services."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlmodel import Session, select

from src.db.courses.courses import Course
from src.db.resource_authors import (
    ResourceAuthor,
    ResourceAuthorshipEnum,
    ResourceAuthorshipStatusEnum,
)
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker

# Which authorship kinds are considered "owners" for RBAC purposes.
# CONTRIBUTOR is included so instructors collaborating on a course pass the
# ``own`` scope when they only have ``:own``-scoped permissions.
_OWNER_AUTHORSHIPS: frozenset[ResourceAuthorshipEnum] = frozenset(
    {
        ResourceAuthorshipEnum.CREATOR,
        ResourceAuthorshipEnum.MAINTAINER,
        ResourceAuthorshipEnum.CONTRIBUTOR,
    }
)


def is_course_owner(
    db_session: Session,
    user_id: int,
    course_uuid: str,
) -> bool:
    """Return True if *user_id* is an ACTIVE author (creator/maintainer/
    contributor) of the course identified by *course_uuid*.

    Ownership on a course is not just "I created it" — a course can have
    multiple authors recorded in ``resource_authors``.  The ``own`` scope of
    course-related permissions must cover any of them, otherwise an instructor
    added as a MAINTAINER cannot edit a course they legitimately co-own.
    """
    if user_id == 0:
        return False

    stmt = select(ResourceAuthor).where(
        ResourceAuthor.resource_uuid == course_uuid,
        ResourceAuthor.user_id == user_id,
        ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
    )
    row = db_session.exec(stmt).first()
    return bool(row and row.authorship in _OWNER_AUTHORSHIPS)


def require_course_permission(
    action: str,
    current_user: PublicUser | AnonymousUser,
    course: Course,
    checker: PermissionChecker,
) -> None:
    """Raise HTTP 403 if *current_user* lacks *action* on *course*.

    Treats any ACTIVE author (CREATOR / MAINTAINER / CONTRIBUTOR) as the
    resource owner for ``:own``-scoped permissions — not just the original
    ``creator_id``.  This fixes the case where an instructor was added as a
    MAINTAINER to a course they did not create and was then denied edits
    despite holding ``course:update:own``.

    Args:
        action: Permission string, e.g. ``"chapter:create"``, ``"activity:update"``.
        current_user: Authenticated (or anonymous) user.
        course: The course being acted upon.
        checker: Injected :class:`PermissionChecker` instance.

    Raises:
        HTTPException(403): When the check fails.
        HTTPException(401): If *current_user* is anonymous and the action is
            not publicly accessible.
    """
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    is_owner = is_course_owner(checker.db, current_user.id, course.course_uuid)

    checker.require(
        current_user.id,
        action,
        resource_owner_id=course.creator_id,
        is_owner=is_owner,
    )
