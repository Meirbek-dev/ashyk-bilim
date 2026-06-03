from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from src.auth.users import get_optional_public_user, get_public_user
from src.db.trails import TrailCreate, TrailRead
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.services.trail.trail import (
    Trail,
    add_activity_to_trail,
    add_course_to_trail,
    create_user_trail,
    get_user_trails,
    remove_activity_from_trail,
    remove_course_from_trail,
)

router = APIRouter()


@router.post("/start", response_model=Trail)
async def api_start_trail(
    request: Request,
    trail_object: TrailCreate,
    user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> Trail:
    """
    Start trail
    """
    return await create_user_trail(request, user, trail_object, db_session)


@router.get("", response_model=TrailRead)
async def api_get_user_trail(
    request: Request,
    user: Annotated[PublicUser | AnonymousUser | None, Depends(get_optional_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> TrailRead:
    """
    Get a user trails
    """
    if isinstance(user, AnonymousUser):
        return TrailRead(user_id=0, runs=[], trail_uuid="anonymous")
    return await get_user_trails(request, user=user, db_session=db_session)


@router.post("/add_course/{course_uuid}", response_model=TrailRead)
async def api_add_course_to_trail(
    request: Request,
    course_uuid: str,
    user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> TrailRead:
    """
    Add Course to trail
    """
    return await add_course_to_trail(request, user, course_uuid, db_session)


@router.delete("/remove_course/{course_uuid}", response_model=TrailRead)
async def api_remove_course_to_trail(
    request: Request,
    course_uuid: str,
    user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> TrailRead:
    """
    Remove Course from trail
    """
    return await remove_course_from_trail(request, user, course_uuid, db_session)


@router.post("/add_activity/{activity_uuid}", response_model=TrailRead)
async def api_add_activity_to_trail(
    request: Request,
    activity_uuid: str,
    user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> TrailRead:
    """
    Add Course to trail
    """
    return await add_activity_to_trail(request, user, activity_uuid, db_session)


@router.delete("/remove_activity/{activity_uuid}", response_model=TrailRead)
async def api_remove_activity_from_trail(
    request: Request,
    activity_uuid: str,
    user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> TrailRead:
    """
    Remove Activity from trail
    """
    return await remove_activity_from_trail(request, user, activity_uuid, db_session)
