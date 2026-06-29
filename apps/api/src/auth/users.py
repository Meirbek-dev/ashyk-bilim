"""FastAPIUsers instance and canonical dependency helpers.

Use these dependencies in route handlers instead of the old custom_auth deps:

    current_active_user   → requires auth, raises 401 if missing / inactive
    current_optional_user → returns AnonymousUser when unauthenticated
    current_superuser     → requires is_superuser=True
"""

from typing import Annotated

from fastapi import Depends
from fastapi_users import FastAPIUsers

from src.app.exceptions import PermissionAppError
from src.auth.backend import auth_backend
from src.auth.manager import get_user_manager
from src.db.users import AnonymousUser, PublicUser, User

fastapi_users = FastAPIUsers[User, int](
    get_user_manager,
    [auth_backend],
)

current_active_user = fastapi_users.current_user(active=True)
current_optional_user = fastapi_users.current_user(active=True, optional=True)


def get_public_user(
    user: Annotated[User | None, Depends(current_active_user)] = None,
) -> PublicUser:
    assert user is not None
    return PublicUser.model_validate(user)


def get_optional_public_user(
    user: Annotated[User | None, Depends(current_optional_user)] = None,
) -> PublicUser | AnonymousUser:
    if user is None:
        return AnonymousUser()
    return PublicUser.model_validate(user)


def _require_superuser(
    user: Annotated[PublicUser | None, Depends(get_public_user)] = None,
) -> PublicUser:
    assert user is not None
    if not user.is_superuser:
        raise PermissionAppError(
            code="SUPERUSER_REQUIRED",
            message="Требуются права суперпользователя",
        )
    return user


CurrentActiveUser = Annotated[PublicUser, Depends(get_public_user)]
CurrentOptionalUser = Annotated[PublicUser | AnonymousUser, Depends(get_optional_public_user)]
CurrentSuperuser = Annotated[PublicUser, Depends(_require_superuser)]

__all__ = [
    "CurrentActiveUser",
    "CurrentOptionalUser",
    "CurrentSuperuser",
    "auth_backend",
    "fastapi_users",
]
