"""Redis-backed grading event publication for SSE clients."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from src.infra import redis as redis_infra

logger = logging.getLogger(__name__)


def grading_channel(submission_uuid: str) -> str:
    return f"grading:submission:{submission_uuid}"


def grading_event(
    event_type: str,
    submission_uuid: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "event": event_type,
        "submission_uuid": submission_uuid,
        "payload": payload or {},
        "sent_at": datetime.now(UTC).isoformat(),
    }


def encode_sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def publish_grading_event(
    event_type: str,
    submission_uuid: str,
    payload: dict[str, Any] | None = None,
) -> None:
    """Publish a grading event. Missing Redis is a no-op."""
    client = redis_infra.get_sync()
    if client is None:
        return
    message = grading_event(event_type, submission_uuid, payload)
    try:
        client.publish(grading_channel(submission_uuid), json.dumps(message, default=str))
    except Exception:
        logger.warning("Failed to publish grading event %s", event_type, exc_info=True)
