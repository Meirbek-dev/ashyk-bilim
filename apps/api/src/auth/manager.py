"""UserManager — business logic layer (fastapi-users).

Handles: password hashing, registration hooks, password reset tokens,
email verification tokens.
"""

from typing import Any

from fastapi import Request
from fastapi_users import BaseUserManager, IntegerIDMixin
from fastapi_users.password import PasswordHelper
from passlib.context import CryptContext

from src.db.users import User
from src.security.keys import get_jwt_secret

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


class UserManager(IntegerIDMixin, BaseUserManager[User, int]):
    @property
    def reset_password_token_secret(self) -> str:  # type: ignore[override]
        return get_jwt_secret()

    @property
    def verification_token_secret(self) -> str:  # type: ignore[override]
        return get_jwt_secret()

    def __init__(self, user_db: Any) -> None:
        super().__init__(user_db, password_helper=PasswordHelper(pwd_context))

    async def on_after_register(
        self, user: User, request: Request | None = None
    ) -> None:
        pass

    async def on_after_login(
        self,
        user: User,
        request: Request | None = None,
        response: Any | None = None,
    ) -> None:
        pass

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        pass

    async def on_after_reset_password(
        self, user: User, request: Request | None = None
    ) -> None:
        from src.services.auth.sessions import revoke_all_user_sessions

        await revoke_all_user_sessions(user.id)


async def get_user_manager(request: Request):
    from src.auth.db import get_user_db

    user_db = get_user_db(request)
    yield UserManager(user_db)
