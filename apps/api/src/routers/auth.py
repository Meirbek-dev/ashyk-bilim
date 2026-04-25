import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from src.db.users import PublicUser, User, UserSession
from src.infra.db.session import get_db_session
from src.auth.users import CurrentActiveUser
from src.services.users.users import get_user_session

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/me", response_model=UserSession)
async def get_me(
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: CurrentActiveUser,
) -> UserSession:
    """Return full session data including roles, permissions, and user profile."""
    # current_user is already a PublicUser
    from fastapi import Request
    # But get_user_session might need a dummy request if we don't have it
    # Let's import request from fastapi
    return get_user_session(None, db_session, current_user)

@router.get("/sessions")
async def list_sessions(
    current_user: CurrentActiveUser,
    db_session: Annotated[Session, Depends(get_db_session)],
):
    user = db_session.exec(
        select(User).where(User.user_uuid == current_user.user_uuid)
    ).first()
    if not user:
        return []
    from src.services.auth.sessions import get_user_active_sessions
    return await get_user_active_sessions(user.id)
