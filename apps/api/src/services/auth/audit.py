"""Structured audit log for security events.

All writes are append-only. The table is never read during token validation.

Two entry points:
- write_audit_event()     — synchronous; used by sessions.py internals
- enqueue_audit_event()   — returns a callable suitable for FastAPI BackgroundTasks,
                            opening its own short-lived DB session so the response
                            session is not reused after it has been closed.
"""

import logging
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session

from src.db.auth_audit_log import AuthAuditLog

logger = logging.getLogger(__name__)


def write_audit_event(
    db_session: Session,
    *,
    event_type: str,
    user_id: str | None = None,
    session_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    metadata: dict[str, Any] | None = None,
    severity: str = "info",
) -> None:
    """Write a security audit event using an existing DB session.

    Never raises — audit failures must not block auth flows.
    """
    try:
        entry = AuthAuditLog(
            created_at=datetime.now(UTC),
            user_id=user_id,
            event_type=event_type,
            session_id=session_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata_=metadata,
            severity=severity,
        )
        db_session.add(entry)
        db_session.commit()
    except Exception:
        logger.exception("Failed to write audit event: %s", event_type)


def _audit_background_task(
    event_type: str,
    user_id: str | None,
    session_id: str | None,
    ip_address: str | None,
    user_agent: str | None,
    metadata: dict[str, Any] | None,
    severity: str,
) -> None:
    """Background-task target: opens its own DB session to write the audit event.

    This is intentionally synchronous so it can be used as a FastAPI
    BackgroundTask without requiring an async session factory.  The session
    lifetime is scoped to this function and closed immediately after the write.
    """
    try:
        from src.infra.db.engine import get_bg_engine

        engine = get_bg_engine()
        with Session(engine) as session:
            write_audit_event(
                session,
                event_type=event_type,
                user_id=user_id,
                session_id=session_id,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata=metadata,
                severity=severity,
            )
    except Exception:
        logger.exception("Background audit write failed: %s", event_type)


def enqueue_audit_event(
    background_tasks: Any,  # fastapi.BackgroundTasks — typed as Any to avoid import
    *,
    event_type: str,
    user_id: str | None = None,
    session_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    metadata: dict[str, Any] | None = None,
    severity: str = "info",
) -> None:
    """Enqueue an audit event to be written after the response is sent.

    Uses FastAPI BackgroundTasks so audit writes never add latency to the
    auth response path.  The background task creates its own DB session.
    """
    background_tasks.add_task(
        _audit_background_task,
        event_type,
        user_id,
        session_id,
        ip_address,
        user_agent,
        metadata,
        severity,
    )
