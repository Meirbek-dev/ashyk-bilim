from typing import Annotated

from fastapi import APIRouter, Depends, Request

from src.db.courses.chapters import (
    ActivityOrderPayload,
    ChapterCreateRequest,
    ChapterOrderPayload,
    ChapterRead,
    ChapterUpdate,
    ChapterUpdateOrder,
)
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user, get_current_user_optional
from src.services.courses.chapters import (
    create_chapter,
    delete_chapter,
    get_chapter,
    move_activity_to_order,
    move_chapter_to_order,
    reorder_chapters_and_activities,
    update_chapter,
)

router = APIRouter()


@router.post("")
async def api_create_coursechapter(
    request: Request,
    coursechapter_object: ChapterCreateRequest,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> ChapterRead:
    return await create_chapter(request, coursechapter_object, current_user, db_session)


@router.get("/{chapter_uuid}")
async def api_get_coursechapter(
    request: Request,
    chapter_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_current_user_optional)
    ],
    db_session=Depends(get_db_session),
) -> ChapterRead:
    return await get_chapter(request, chapter_uuid, current_user, db_session)


@router.patch("/{chapter_uuid}/order")
async def api_move_chapter_to_order(
    request: Request,
    chapter_uuid: str,
    payload: ChapterOrderPayload,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> ChapterRead:
    """Move a chapter to a specific position within its course (atomic)."""
    return await move_chapter_to_order(
        request, chapter_uuid, payload.position, current_user, db_session
    )


@router.patch("/{chapter_uuid}/activities/{activity_uuid}/order")
async def api_move_activity_to_order(
    request: Request,
    chapter_uuid: str,
    activity_uuid: str,
    payload: ActivityOrderPayload,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> dict:
    """Move an activity to a specific position, optionally into a different chapter (atomic)."""
    return await move_activity_to_order(
        request,
        activity_uuid,
        payload.position,
        payload.chapter_uuid,
        current_user,
        db_session,
    )


@router.patch("/course/{course_uuid}/order")
async def api_reorder_chapters_and_activities(
    request: Request,
    course_uuid: str,
    order: ChapterUpdateOrder,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> dict:
    """Bulk reorder all chapters and activities (legacy — prefer atomic endpoints)."""
    return await reorder_chapters_and_activities(
        request, course_uuid, order, current_user, db_session
    )


@router.patch("/{chapter_uuid}")
async def api_update_coursechapter(
    request: Request,
    coursechapter_object: ChapterUpdate,
    chapter_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> ChapterRead:
    return await update_chapter(
        request, coursechapter_object, chapter_uuid, current_user, db_session
    )


@router.delete("/{chapter_uuid}")
async def api_delete_coursechapter(
    request: Request,
    chapter_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> dict:
    return await delete_chapter(request, chapter_uuid, current_user, db_session)
