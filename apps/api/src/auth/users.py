"""FastAPIUsers instance and canonical dependency helpers.

Use these dependencies in route handlers instead of the old custom_auth deps:

    current_active_user   → requires auth, raises 401 if missing / inactive
    current_optional_user → returns AnonymousUser when unauthenticated
    current_superuser     → requires is_superuser=True
"""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi_users import FastAPIUsers

from src.auth.backend import auth_backend
from src.auth.manager import get_user_manager
from src.db.users import AnonymousUser, PublicUser, User

fastapi_users = FastAPIUsers[User, int](
    get_user_manager,
    [auth_backend],
)

def get_public_user(user: User = Depends(fastapi_users.current_user(active=True))) -> PublicUser:
    return PublicUser.model_validate(user)

def get_optional_public_user(user: User | None = Depends(fastapi_users.current_user(active=True, optional=True))) -> PublicUser | AnonymousUser:
    if user is None:
        return AnonymousUser()
    return PublicUser.model_validate(user)

def _require_superuser(user: PublicUser = Depends(get_public_user)) -> PublicUser:
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser access required",
        )
    return user

CurrentActiveUser = Annotated[PublicUser, Depends(get_public_user)]
CurrentOptionalUser = Annotated[PublicUser | AnonymousUser, Depends(get_optional_public_user)]
CurrentSuperuser = Annotated[PublicUser, Depends(_require_superuser)]

__all__ = [
    "fastapi_users",
    "auth_backend",
    "CurrentActiveUser",
    "CurrentOptionalUser",
    "CurrentSuperuser",
]
