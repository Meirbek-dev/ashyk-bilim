from typing import Any

from sqlalchemy.engine import Result
from sqlalchemy.orm import Session as SQLAlchemySession
from sqlmodel import Session


def sa_execute(session: Session, statement: Any) -> Result[Any]:
    return SQLAlchemySession.execute(session, statement)
