"""Proxy file for backwards compatibility.

Re-exports dependency functions that have been moved to src.auth.users
and provides helper exceptions/functions that were previously here.
"""

from typing import Annotated

from fastapi import Depends

from src.auth.users import (
    CurrentActiveUser,
    CurrentOptionalUser,
    CurrentSuperuser,
    get_optional_public_user,
    get_public_user,
)
from src.db.users import AnonymousUser, UserRead
from src.security.rbac import AuthenticationRequired

# Backwards compatibility aliases for imports across the app
get_current_user = get_public_user
get_current_user_optional = get_optional_public_user


async def non_public_endpoint(current_user: UserRead | AnonymousUser) -> None:
    if isinstance(current_user, AnonymousUser):
        raise AuthenticationRequired

# Note: get_access_token_from_request and decode_access_token
# are deliberately NOT exported here anymore to prevent their use.
