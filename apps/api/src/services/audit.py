"""Audit event recording service.

Provides a single entry point for recording non-grade actions (policy overrides,
lifecycle transitions, bulk operations) into the append-only audit_event table.
"""

from __future__ import annotations

import logging

from sqlmodel import Session
from ulid import ULID

from src.db.audit import AuditEvent, AuditEventType
from src.types import JsonObject

logger = logging.getLogger(__name__)


def record_audit_event(
    db_session: Session,
    *,
    actor_id: int,
    event_type: AuditEventType | str,
    target_kind: str,
    target_uuid: str,
    payload: JsonObject | None = None,
) -> AuditEvent:
    """Record an audit event in the current transaction.

    The event is committed with the caller's transaction — if the caller
    rolls back, the audit event is also rolled back (intentional: we only
    audit successful operations).
    """
    event = AuditEvent(
        event_uuid=f"audit_{ULID()}",
        actor_id=actor_id,
        event_type=str(event_type),
        target_kind=target_kind,
        target_uuid=target_uuid,
        payload_json=payload or {},
    )
    db_session.add(event)
    logger.info(
        "audit_event type=%s target=%s/%s actor=%d",
        event_type,
        target_kind,
        target_uuid,
        actor_id,
    )
    return event
