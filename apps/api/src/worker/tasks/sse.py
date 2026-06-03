"""Durable SSE-event publication task.

Replaces the inline ``await publish_grading_event(...)`` calls that happen
*after* the DB commit in:

- ``services/grading/teacher.py`` → ``_save_teacher_grade``
- ``services/grading/teacher.py`` → ``bulk_publish_grades``
- ``services/grading/bulk.py``    → ``_publish_event_safe``

The old pattern was fire-and-forget inside the request handler.  If Redis was
transiently unavailable or the process restarted between the DB commit and the
``publish`` call, the student's SSE stream never received the ``grade.published``
event — their UI would appear stuck until they manually refreshed.

With taskiq the Redis ``PUBLISH`` + replay-sorted-set writes are retried up to
3 times with exponential backoff.

Idempotency: ``publish_grading_event`` is inherently idempotent for SSE — a
duplicate ``grade.published`` event is harmless; the frontend deduplicates on
``event_id``.
"""

from __future__ import annotations

import logging
from typing import Any

from src.worker.broker import broker

logger = logging.getLogger(__name__)


@broker.task(
    task_name="sse:publish_grading_event",
    retry_on_error=True,
    max_retries=3,
)
async def publish_grading_event_task(
    event_type: str,
    submission_uuid: str,
    payload: dict[str, Any] | None = None,
) -> None:
    """Publish a grading SSE event to Redis pub/sub and the replay log.

    Idempotent — each call generates a fresh ``event_id`` (ULID), so replays
    produce a duplicate event at most; frontends deduplicate by ``event_id``.

    Args:
        event_type: SSE event name, e.g. ``"grade.published"``.
        submission_uuid: The submission this event belongs to.
        payload: Arbitrary JSON-serialisable payload dict.

    """
    from src.services.grading.events import publish_grading_event

    try:
        await publish_grading_event(event_type, submission_uuid, payload)
    except Exception:
        logger.exception(
            "sse_publish_failed event=%s submission=%s",
            event_type,
            submission_uuid,
        )
        raise  # Let taskiq retry
