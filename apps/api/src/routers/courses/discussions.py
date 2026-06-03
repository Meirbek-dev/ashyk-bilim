from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import Session

from src.auth.users import get_public_user
from src.db.courses.discussions import (
    CourseDiscussionCreate,
    CourseDiscussionRead,
    CourseDiscussionReadWithPermissions,
    CourseDiscussionUpdate,
    DiscussionLikeRead,
)
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
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


class DiscussionMessageResponse(PydanticStrictBaseModel):
    message: str


class DiscussionToggleResponse(PydanticStrictBaseModel):
    message: str
    is_liked: bool
    is_disliked: bool
    likes_count: int
    dislikes_count: int


@router.get("/{course_uuid}/discussions", response_model=list[CourseDiscussionReadWithPermissions])
async def api_get_course_discussions(
    request: Request,
    course_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    include_replies: Annotated[bool, Query(description="Включать ответы в ответ")] = False,
    limit: Annotated[int, Query(le=100, description="Количество обсуждений для возврата")] = 50,
    offset: Annotated[int, Query(description="Количество обсуждений для пропуска")] = 0,
) -> list[CourseDiscussionReadWithPermissions]:
    """
    Get Course Discussions by course_uuid
    """
    return await get_discussions_by_course_uuid(
        request, course_uuid, current_user, db_session, include_replies, limit, offset
    )


@router.post("/{course_uuid}/discussions", response_model=CourseDiscussionRead)
async def api_create_course_discussion(
    request: Request,
    course_uuid: str,
    discussion_object: CourseDiscussionCreate,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> CourseDiscussionRead:
    """
    Create new Course Discussion
    """
    return await create_discussion(request, course_uuid, discussion_object, current_user, db_session)


@router.put("/{course_uuid}/discussions/{discussion_uuid}", response_model=CourseDiscussionRead)
async def api_update_course_discussion(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    discussion_object: CourseDiscussionUpdate,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> CourseDiscussionRead:
    """
    Update Course Discussion by discussion_uuid
    """
    return await update_discussion(request, discussion_uuid, discussion_object, current_user, db_session)


@router.delete("/{course_uuid}/discussions/{discussion_uuid}", response_model=DiscussionMessageResponse)
async def api_delete_course_discussion(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
):
    """
    Delete Course Discussion by discussion_uuid
    """
    return await delete_discussion(request, discussion_uuid, current_user, db_session)


@router.post("/{course_uuid}/discussions/{discussion_uuid}/like", response_model=DiscussionLikeRead)
async def api_like_course_discussion(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> DiscussionLikeRead:
    """
    Like a Course Discussion
    """
    return await like_discussion(request, discussion_uuid, current_user, db_session)


@router.delete("/{course_uuid}/discussions/{discussion_uuid}/like", response_model=DiscussionMessageResponse)
async def api_unlike_course_discussion(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
):
    """
    Unlike a Course Discussion
    """
    return await unlike_discussion(request, discussion_uuid, current_user, db_session)


@router.put("/{course_uuid}/discussions/{discussion_uuid}/like", response_model=DiscussionToggleResponse)
async def api_toggle_course_discussion_like(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
):
    """
    Toggle like status for a Course Discussion (like if not liked, unlike if liked)
    """
    return await toggle_discussion_like(request, discussion_uuid, current_user, db_session)


@router.put("/{course_uuid}/discussions/{discussion_uuid}/dislike", response_model=DiscussionToggleResponse)
async def api_toggle_course_discussion_dislike(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
):
    """
    Toggle dislike status for a Course Discussion (dislike if not disliked, undislike if disliked)
    """
    return await toggle_discussion_dislike(request, discussion_uuid, current_user, db_session)


@router.get("/{course_uuid}/discussions/{discussion_uuid}/replies", response_model=list[CourseDiscussionRead])
async def api_get_discussion_replies(
    request: Request,
    course_uuid: str,
    discussion_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    limit: Annotated[int, Query(le=100, description="Количество ответов для возврата")] = 50,
    offset: Annotated[int, Query(description="Количество ответов для пропуска")] = 0,
) -> list[CourseDiscussionRead]:
    """
    Get replies for a specific discussion
    """
    return await get_discussion_replies(request, discussion_uuid, current_user, db_session, limit, offset)
