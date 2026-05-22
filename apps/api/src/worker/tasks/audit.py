"""Durable audit-log task.

Replaces ``enqueue_audit_event()`` which used FastAPI ``BackgroundTasks`` — a
mechanism that is not retry-safe and drops the write if the process dies
between the HTTP response and the background execution.

Security audit events (login, logout, token revocation, etc.) are critical
enough to warrant at-least-once delivery guaranteed by taskiq + Redis.

Idempotency: the ``auth_audit_log`` table has no unique constraint on
``(user_id, event_type)`` — audit events are append-only by design, so
replaying the task produces a harmless duplicate row.  The ``created_at``
timestamp will differ by the replay delay (typically milliseconds), which is
acceptable for audit purposes.
"""

from __future__ import annotations

import logging
from typing import Any

from src.worker.broker import broker

logger = logging.getLogger(__name__)


@broker.task(task_name="audit:write_event", retry_on_error=True, max_retries=5)
async def write_audit_event_task(
    event_type: str,
    user_id: str | None = None,
    session_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    metadata: dict[str, Any] | None = None,
    severity: str = "info",
) -> None:
    """Persist a security audit event to the ``auth_audit_log`` table.

    Creates its own DB session so it is completely decoupled from the
    original request session (which may already be closed by the time
    this task runs in the worker process).

    Args:
        event_type: Short event identifier, e.g. ``"auth.login"``.
        user_id:    String UUID of the affected user (if known).
        session_id: Session UUID (if applicable).
        ip_address: Client IP address.
        user_agent: Client User-Agent header.
        metadata:   Arbitrary JSON-serialisable extra data.
        severity:   Log severity level (``"info"``, ``"warning"``, etc.).
    """
    import asyncio

    try:
        await asyncio.to_thread(
            _write_audit_sync,
            event_type=event_type,
            user_id=user_id,
            session_id=session_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata,
            severity=severity,
        )
    except Exception:
        logger.exception("audit_write_task failed event=%s", event_type)
        raise  # taskiq will retry


def _write_audit_sync(
    *,
    event_type: str,
    user_id: str | None,
    session_id: str | None,
    ip_address: str | None,
    user_agent: str | None,
    metadata: dict[str, Any] | None,
    severity: str,
) -> None:
    """Synchronous DB write — runs in a thread pool via asyncio.to_thread."""
    from sqlmodel import Session

    from src.infra.db.engine import get_bg_engine
    from src.services.auth.audit import write_audit_event

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
