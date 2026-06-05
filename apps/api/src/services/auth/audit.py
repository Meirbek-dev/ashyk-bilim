"""Structured audit log for security events.

All writes are append-only. The table is never read during token validation.

Two entry points:
- write_audit_event()     — synchronous; used by sessions.py internals
- enqueue_audit_event()   — enqueues a durable taskiq task so audit writes
                            survive process restarts and transient DB failures.
"""

import logging
from datetime import UTC, datetime

from sqlmodel import Session

from src.db.auth_audit_log import AuthAuditLog
from src.types import JsonObject

logger = logging.getLogger(__name__)


def write_audit_event(
    db_session: Session,
    *,
    event_type: str,
    user_id: str | None = None,
    session_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    metadata: JsonObject | None = None,
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
    metadata: JsonObject | None,
    severity: str,
) -> None:
    """Synchronous task target: opens its own DB session to write the audit event.

    Kept for use by the taskiq ``write_audit_event_task`` worker and any
    synchronous callers that cannot use async.
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


async def enqueue_audit_event(
    *,
    event_type: str,
    user_id: str | None = None,
    session_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    metadata: JsonObject | None = None,
    severity: str = "info",
) -> None:
    """Durably enqueue an audit event via taskiq.

    Uses ``write_audit_event_task.kiq()`` so the write is persisted to Redis
    before this coroutine returns.  The worker retries up to 5 times on DB
    failures, ensuring security events are never silently dropped.

    Callers no longer need to pass ``background_tasks`` — remove that
    argument from any call site that previously used it.
    """
    from src.worker.tasks.audit import write_audit_event_task

    await write_audit_event_task.kiq(
        event_type=event_type,
        user_id=user_id,
        session_id=session_id,
        ip_address=ip_address,
        user_agent=user_agent,
        metadata=metadata,
        severity=severity,
    )
