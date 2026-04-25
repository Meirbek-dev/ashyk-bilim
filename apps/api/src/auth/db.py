"""SQLModel → fastapi-users user database adapter.

fastapi-users requires an async UserDatabase interface.  Our app uses
synchronous SQLModel sessions throughout.  This adapter bridges the two by
calling synchronous session methods directly from async methods — the same
pattern already used elsewhere in the codebase (e.g. asyncio.to_thread in
get_current_user_from_token).  Each DB call is fast and non-blocking in practice.
"""

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
        return self.session.exec(select(User).where(User.id == id)).first()

    async def get_by_email(self, email: str) -> User | None:
        return self.session.exec(
            select(User).where(User.email == email.lower())
        ).first()

    async def create(self, create_dict: dict[str, Any]) -> User:
        user = User(**create_dict)
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user

    async def update(self, user: User, update_dict: dict[str, Any]) -> User:
        for key, value in update_dict.items():
            setattr(user, key, value)
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user

    async def delete(self, user: User) -> None:
        self.session.delete(user)
        self.session.commit()


def get_user_db(session: Session = Depends(get_db_session)) -> SQLModelUserDatabase:
    return SQLModelUserDatabase(session)
