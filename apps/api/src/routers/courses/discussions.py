from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import Session

from src.db.courses.discussions import (
    CourseDiscussionCreate,
    CourseDiscussionRead,
    CourseDiscussionReadWithPermissions,
    CourseDiscussionUpdate,
    DiscussionLikeRead,
)
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user
from src.services.courses.discussions import (
    create_discussion,
    delete_discussion,
    get_discussion_replies,
    get_discussions_by_course_uuid,
    like_discussion,
    toggle_discussion_dislike,
    toggle_discussion_like,
    unlike_discussion,
    update_discussion,
)

router = APIRouter()


@router.get("/{course_uuid}/discussions")
async def api_get_course_discussions(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    include_replies: Annotated[
        bool, Query(description="Include replies in response")
    ] = False,
    limit: Annotated[
        int, Query(le=100, description="Number of discussions to return")
    ] = 50,
    offset: Annotated[int, Query(description="Number of discussions to skip")] = 0,
) -> list[CourseDiscussionReadWithPermissions]:
    """
    Get Course Discussions by course_uuid
    """
    return await get_discussions_by_course_uuid(
        request, course_uuid, current_user, db_session, include_replies, limit, offset
    )


@router.post("/{course_uuid}/discussions")
async def api_create_course_discussion(
    request: Request,
    course_uuid: str,
    discussion_object: CourseDiscussionCreate,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> CourseDiscussionRead:
    """
    Create new Course Discussion
    """
    return await create_discussion(
        request, course_uuid, discussion_object, current_user, db_session
    )


@router.put("/{course_uuid}/discussions/{discussion_uuid}")
async def api_update_course_discussion(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    discussion_object: CourseDiscussionUpdate,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> CourseDiscussionRead:
    """
    Update Course Discussion by discussion_uuid
    """
    return await update_discussion(
        request, discussion_uuid, discussion_object, current_user, db_session
    )


@router.delete("/{course_uuid}/discussions/{discussion_uuid}")
async def api_delete_course_discussion(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
):
    """
    Delete Course Discussion by discussion_uuid
    """
    return await delete_discussion(request, discussion_uuid, current_user, db_session)


@router.post("/{course_uuid}/discussions/{discussion_uuid}/like")
async def api_like_course_discussion(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> DiscussionLikeRead:
    """
    Like a Course Discussion
    """
    return await like_discussion(request, discussion_uuid, current_user, db_session)


@router.delete("/{course_uuid}/discussions/{discussion_uuid}/like")
async def api_unlike_course_discussion(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
):
    """
    Unlike a Course Discussion
    """
    return await unlike_discussion(request, discussion_uuid, current_user, db_session)


@router.put("/{course_uuid}/discussions/{discussion_uuid}/like")
async def api_toggle_course_discussion_like(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
):
    """
    Toggle like status for a Course Discussion (like if not liked, unlike if liked)
    """
    return await toggle_discussion_like(
        request, discussion_uuid, current_user, db_session
    )


@router.put("/{course_uuid}/discussions/{discussion_uuid}/dislike")
async def api_toggle_course_discussion_dislike(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
):
    """
    Toggle dislike status for a Course Discussion (dislike if not disliked, undislike if disliked)
    """
    return await toggle_discussion_dislike(
        request, discussion_uuid, current_user, db_session
    )


@router.get("/{course_uuid}/discussions/{discussion_uuid}/replies")
async def api_get_discussion_replies(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    limit: Annotated[
        int, Query(le=100, description="Number of replies to return")
    ] = 50,
    offset: Annotated[int, Query(description="Number of replies to skip")] = 0,
) -> list[CourseDiscussionRead]:
    """
    Get replies for a specific discussion
    """
    return await get_discussion_replies(
        request, discussion_uuid, current_user, db_session, limit, offset
    )
