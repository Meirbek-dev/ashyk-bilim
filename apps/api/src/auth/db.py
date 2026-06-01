"""SQLModel → fastapi-users user database adapter.

fastapi-users requires an async UserDatabase interface. The rest of this app
uses synchronous SQLModel sessions, so each async method opens its own short-lived
session inside the worker thread that performs the blocking database call.
Request-scoped sessions are never moved across threads.
"""

import asyncio
from typing import Annotated, Any, override

from fastapi import Depends
from fastapi_users.db import BaseUserDatabase
from sqlmodel import select

from src.db.users import User
from src.infra.db.session import SessionFactory, get_session_factory


class SQLModelUserDatabase(BaseUserDatabase[User, int]):
    def __init__(self, session_factory: SessionFactory) -> None:
        self.session_factory = session_factory

    @override
    async def get(self, id: int) -> User | None:
        def _get() -> User | None:
            with self.session_factory() as session:
                return session.exec(select(User).where(User.id == id)).first()

        return await asyncio.to_thread(_get)

    @override
    async def get_by_email(self, email: str) -> User | None:
        def _get_by_email() -> User | None:
            with self.session_factory() as session:
                return session.exec(select(User).where(User.email == email.lower())).first()

        return await asyncio.to_thread(_get_by_email)

    @override
    async def create(self, create_dict: dict[str, Any]) -> User:
        def _create() -> User:
            with self.session_factory() as session:
                user = User(**create_dict)
                session.add(user)
                session.commit()
                session.refresh(user)
                return user

        return await asyncio.to_thread(_create)

    @override
    async def update(self, user: User, update_dict: dict[str, Any]) -> User:
        def _update() -> User:
            with self.session_factory() as session:
                db_user = session.get(User, user.id)
                if db_user is None:
                    db_user = session.merge(user)
                for key, value in update_dict.items():
                    setattr(db_user, key, value)
                session.add(db_user)
                session.commit()
                session.refresh(db_user)
                return db_user

        return await asyncio.to_thread(_update)

    @override
    async def delete(self, user: User) -> None:
        def _delete() -> None:
            with self.session_factory() as session:
                db_user = session.get(User, user.id)
                if db_user is None:
                    return
                session.delete(db_user)
                session.commit()

        await asyncio.to_thread(_delete)


def get_user_db(
    session_factory: Annotated[SessionFactory | None, Depends(get_session_factory)] = None,
) -> SQLModelUserDatabase:
    assert session_factory is not None
    return SQLModelUserDatabase(session_factory)
