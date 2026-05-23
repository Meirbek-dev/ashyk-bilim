"""UserManager — business logic layer (fastapi-users)."""

import asyncio
import logging
from typing import Annotated, Any

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, IntegerIDMixin
from fastapi_users.exceptions import InvalidPasswordException

from src.auth.db import get_user_db
from src.db.users import User
from src.security.keys import get_jwt_secret
from src.security.security import password_helper

_logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 8


class UserManager(IntegerIDMixin, BaseUserManager[User, int]):
    @property
    def reset_password_token_secret(self) -> str:  # type: ignore[override]
        return get_jwt_secret()

    def __init__(self, user_db: Any) -> None:
        super().__init__(user_db, password_helper=password_helper)

    async def validate_password(self, password: str, user: Any) -> None:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise InvalidPasswordException(
                reason=f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
            )

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        from src.db.users import UserRead
        from src.services.users.emails import enqueue_password_reset_email

        try:
            user_read = UserRead.model_validate(user)
            await enqueue_password_reset_email(
                generated_reset_code=token,
                username=user_read.username,
                email=str(user.email),
            )
        except Exception:
            _logger.exception(
                "Failed to schedule password reset email for user %s", user.id
            )

    async def on_after_reset_password(
        self, user: User, request: Request | None = None
    ) -> None:
        from src.services.auth.sessions import revoke_all_user_sessions

        await revoke_all_user_sessions(user.id)

    async def on_after_register(
        self, user: User, request: Request | None = None
    ) -> None:
        from src.services.users.users import ensure_user_has_default_role

        if user.id is None:
            _logger.warning("Cannot assign default role: registered user has no id")
            return

        session_factory = getattr(self.user_db, "session_factory", None)
        if session_factory is None:
            _logger.warning(
                "Cannot assign default role: user DB has no session factory"
            )
            return

        def _assign_default_role() -> None:
            with session_factory() as session:
                ensure_user_has_default_role(session, user.id)

        await asyncio.to_thread(_assign_default_role)


async def get_user_manager(user_db: Annotated[Any, Depends(get_user_db)] = None):
    assert user_db is not None
    yield UserManager(user_db)
