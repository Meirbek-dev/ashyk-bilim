"""Redis-backed grading event publication for SSE clients."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from ulid import ULID

from src.infra import redis as redis_infra

logger = logging.getLogger(__name__)

# Sorted-set key for event replay.  Score = UNIX timestamp (float).
# Retained for 1 hour after last write.
_REPLAY_TTL_SECONDS: int = 3600
_REPLAY_WINDOW_SECONDS: int = 300  # only replay events from the last 5 minutes


def grading_channel(submission_uuid: str) -> str:
    return f"grading:submission:{submission_uuid}"


def _replay_key(submission_uuid: str) -> str:
    return f"sse_events:{submission_uuid}"


def grading_event(
    event_type: str,
    submission_uuid: str,
    payload: dict[str, Any] | None = None,
    *,
    event_id: str | None = None,
) -> dict[str, Any]:
    return {
        "event": event_type,
        "event_id": event_id or str(ULID()),
        "submission_uuid": submission_uuid,
        "payload": payload or {},
        "sent_at": datetime.now(UTC).isoformat(),
    }


def encode_sse(event: str, data: dict[str, Any]) -> str:
    event_id = data.get("event_id", "")
    id_line = f"id: {event_id}\n" if event_id else ""
    return f"{id_line}event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def publish_grading_event(
    event_type: str,
    submission_uuid: str,
    payload: dict[str, Any] | None = None,
) -> None:
    """Publish a grading event to Redis pub/sub and store it in the replay log."""
    client = redis_infra.get_sync()
    if client is None:
        return
    message = grading_event(event_type, submission_uuid, payload)
    serialized = json.dumps(message, default=str)
    try:
        client.publish(grading_channel(submission_uuid), serialized)

        # Persist event in sorted set (score = UNIX timestamp) for Last-Event-ID replay.
        replay_key = _replay_key(submission_uuid)
        score = datetime.now(UTC).timestamp()
        client.zadd(replay_key, {serialized: score})
        client.expire(replay_key, _REPLAY_TTL_SECONDS)
    except Exception:
        logger.warning("Failed to publish grading event %s", event_type, exc_info=True)


async def get_events_since(
    submission_uuid: str,
    since_event_id: str,
) -> list[dict[str, Any]]:
    """Return events from the replay log that occurred after ``since_event_id``.

    We scan the full replay window (up to ``_REPLAY_WINDOW_SECONDS``) and
    filter out events whose ``event_id`` appears at or before the requested ID.
    If ``since_event_id`` is not found in the log, all events in the window are
    returned.
    """
    client = redis_infra.get_async()
    if client is None:
        return []

    replay_key = _replay_key(submission_uuid)
    now = datetime.now(UTC).timestamp()
    min_score = now - _REPLAY_WINDOW_SECONDS

    try:
        raw_events: list[bytes] = await client.zrangebyscore(
            replay_key, min_score, "+inf"
        )
    except Exception:
        logger.warning("Failed to fetch replay events", exc_info=True)
        return []

    events: list[dict[str, Any]] = []
    for raw in raw_events:
        try:
            events.append(json.loads(raw))
        except Exception:
            logger.warning("Failed to decode replay event: %s", raw)
            continue

    if not since_event_id:
        return events

    # Find the index of the event matching since_event_id and return everything after it.
    found_idx: int | None = None
    for i, ev in enumerate(events):
        if ev.get("event_id") == since_event_id:
            found_idx = i
            break

    if found_idx is None:
        return events  # ID not in window — return everything
    return events[found_idx + 1 :]
