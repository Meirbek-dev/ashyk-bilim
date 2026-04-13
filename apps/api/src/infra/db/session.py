import contextlib
import logging
from collections.abc import Iterator

from fastapi import HTTPException, Request
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session

logger = logging.getLogger(__name__)


@contextlib.contextmanager
def session_scope(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    """Context manager for DB access outside of a FastAPI request (CLI, background tasks).

    Callers must supply the session factory explicitly — there is no hidden global.
    """
    session: Session = session_factory()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db_session(request: Request) -> Iterator[Session]:
    """FastAPI dependency that yields a request-scoped DB session.

    Reads the session factory from ``app.state``, which is set during lifespan
    startup.  An ``AttributeError`` here means lifespan did not complete — that
    is a bug, not a fallback scenario.
    """
    session: Session = request.app.state.session_factory()
    try:
        yield session
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        logger.exception("Database session error")
        session.rollback()
        raise
    finally:
        session.close()
