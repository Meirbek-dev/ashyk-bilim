"""UserManager — business logic layer (fastapi-users).

Handles: password hashing, registration hooks, password reset tokens,
email verification tokens.
"""

import logging
from typing import Any

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, IntegerIDMixin
from fastapi_users.exceptions import InvalidPasswordException

from src.auth.db import get_user_db
from src.db.users import User
from src.security.keys import get_jwt_secret
from src.security.security import pwd_context, password_helper

_logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 8


class UserManager(IntegerIDMixin, BaseUserManager[User, int]):
    @property
    def reset_password_token_secret(self) -> str:  # type: ignore[override]
        return get_jwt_secret()

    @property
    def verification_token_secret(self) -> str:  # type: ignore[override]
        return get_jwt_secret()

    def __init__(self, user_db: Any) -> None:
        super().__init__(user_db, password_helper=password_helper)

    async def validate_password(self, password: str, user: Any) -> None:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise InvalidPasswordException(
                reason=f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
            )

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
        from src.db.users import UserRead
        from src.services.users.emails import send_password_reset_email

        try:
            user_read = UserRead.model_validate(user)
            send_password_reset_email(
                generated_reset_code=token,
                user=user_read,
                email=str(user.email),
            )
        except Exception:
            _logger.exception(
                "Failed to send password reset email for user %s", user.id
            )

    async def on_after_reset_password(
        self, user: User, request: Request | None = None
    ) -> None:
        from src.services.auth.sessions import revoke_all_user_sessions

        await revoke_all_user_sessions(user.id)


async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)
