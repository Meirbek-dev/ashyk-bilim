"""Course membership and access helpers.

These functions are used across multiple assignment/submission service modules
to determine whether a user has read or submit access to course content.
"""

from sqlmodel import Session, select

from src.db.courses.courses import Course
from src.db.resource_authors import ResourceAuthor, ResourceAuthorshipStatusEnum
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser


def user_has_course_access(user_id: int, course: Course, db_session: Session) -> bool:
    """Return True if *user_id* is allowed to access *course* content.

    Access is granted when any of the following is true:
    - The course is public.
    - The user is an active author/contributor of the course.
    - The course has no linked user-groups (open enrollment).
    - The user belongs to at least one user-group linked to the course.
    """
    if course.public:
        return True

    author_stmt = select(ResourceAuthor.id).where(
        ResourceAuthor.resource_uuid == course.course_uuid,
        ResourceAuthor.user_id == user_id,
        ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
    )
    if db_session.exec(author_stmt).first() is not None:
        return True

    linked_groups = db_session.exec(
        select(UserGroupResource.id).where(
            UserGroupResource.resource_uuid == course.course_uuid
        )
    ).all()
    if not linked_groups:
        return True

    member_stmt = (
        select(UserGroupUser.id)
        .join(
            UserGroupResource,
            UserGroupUser.usergroup_id == UserGroupResource.usergroup_id,
        )
        .where(
            UserGroupResource.resource_uuid == course.course_uuid,
            UserGroupUser.user_id == user_id,
        )
    )
    return db_session.exec(member_stmt).first() is not None
