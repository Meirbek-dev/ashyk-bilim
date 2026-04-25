"""SQLModel → fastapi-users user database adapter.

fastapi-users requires an async UserDatabase interface. Our app uses
synchronous SQLModel sessions throughout. Each method wraps its DB call in
asyncio.to_thread so the event loop is never blocked by slow queries.
The session is created per-request and never shared across threads concurrently,
so this is thread-safe.
"""

import asyncio
from typing import Any

from fastapi import Depends
from fastapi_users.db import BaseUserDatabase
from sqlmodel import Session, select

from src.db.users import User
from src.infra.db.session import get_db_session


class SQLModelUserDatabase(BaseUserDatabase[User, int]):
    def __init__(self, session: Session) -> None:
        self.session = session

    async def get(self, id: int) -> User | None:
        return await asyncio.to_thread(
            lambda: self.session.exec(select(User).where(User.id == id)).first()
        )

    async def get_by_email(self, email: str) -> User | None:
        return await asyncio.to_thread(
            lambda: self.session.exec(
                select(User).where(User.email == email.lower())
            ).first()
        )

    async def create(self, create_dict: dict[str, Any]) -> User:
        def _create() -> User:
            user = User(**create_dict)
            self.session.add(user)
            self.session.commit()
            self.session.refresh(user)
            return user

        return await asyncio.to_thread(_create)

    async def update(self, user: User, update_dict: dict[str, Any]) -> User:
        def _update() -> User:
            for key, value in update_dict.items():
                setattr(user, key, value)
            self.session.add(user)
            self.session.commit()
            self.session.refresh(user)
            return user

        return await asyncio.to_thread(_update)

    async def delete(self, user: User) -> None:
        def _delete() -> None:
            self.session.delete(user)
            self.session.commit()

        await asyncio.to_thread(_delete)


def get_user_db(session: Session = Depends(get_db_session)) -> SQLModelUserDatabase:
    return SQLModelUserDatabase(session)
