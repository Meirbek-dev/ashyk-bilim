"""Shared permission guards for course / chapter / activity services."""

from fastapi import HTTPException, status

from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker


def require_course_permission(
    action: str,
    current_user: PublicUser | AnonymousUser,
    course: Course,
    checker: PermissionChecker,
) -> None:
    """Raise HTTP 403 if *current_user* lacks *action* on *course*.

    Uses the course's ``creator_id`` as the resource-owner hint so that
    instructors who own the course always pass the :own permission variants.

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
    checker.require(current_user.id, action, resource_owner_id=course.creator_id)
