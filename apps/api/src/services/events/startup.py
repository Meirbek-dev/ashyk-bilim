"""Event bus startup — registers all subscribers.

Call `register_all_subscribers()` during application lifespan startup
to wire all event handlers to the bus.

Architecture
------------
- ``AnalyticsSubscriber`` stays in-process (logging only; no durability
  requirement).
- Durable side-effects (XP award, plagiarism check) are now enqueued as
  taskiq tasks via ``.kiq()``.  This guarantees at-least-once delivery
  even if the API process restarts mid-flight.

Usage in lifespan.py:
    from src.services.events.startup import register_all_subscribers
    register_all_subscribers()
"""

from __future__ import annotations

import logging

from src.services.events.bus import get_event_bus
from src.services.events.subscribers.analytics import AnalyticsSubscriber
from src.services.events.types import (
    AssessmentPublishedEvent,
    FileSubmissionGradedEvent,
    FileSubmissionPublishedEvent,
    FileSubmissionReturnedEvent,
    FileSubmissionSubmittedEvent,
    GradePublishedEvent,
    PolicyOverrideCreatedEvent,
    SubmissionReturnedEvent,
    SubmissionSubmittedEvent,
)

logger = logging.getLogger(__name__)

_registered = False


# ── Durable event subscribers (thin kiq wrappers) ────────────────────────────


async def _enqueue_xp_award(event: GradePublishedEvent) -> None:
    """Enqueue a durable XP-award task for a published grade."""
    from src.worker.tasks.xp_award import award_xp_for_submission

    # We don't know the assessment_type here — the task will look it up.
    # Pass an empty string; the task resolves it from the Submission row.
    await award_xp_for_submission.kiq(
        submission_uuid=event.submission_uuid,
        user_id=event.user_id,
        assessment_type="",  # resolved inside the task from the DB row
    )


async def _enqueue_plagiarism_check(
    event: SubmissionSubmittedEvent | FileSubmissionSubmittedEvent,
) -> None:
    """Enqueue a durable plagiarism-check task for a file submission."""
    if not event.file_keys:
        return

    from src.worker.tasks.plagiarism import check_file_submission_plagiarism

    submission_uuid = getattr(event, "submission_uuid", None) or getattr(event, "attempt_uuid", "")
    await check_file_submission_plagiarism.kiq(
        submission_uuid=submission_uuid,
        file_keys=list(event.file_keys),
    )


# ── Registration ──────────────────────────────────────────────────────────────


def register_all_subscribers() -> None:
    """Register all event subscribers with the application event bus.

    Idempotent — safe to call multiple times (only registers once).
    """
    global _registered
    if _registered:
        return

    bus = get_event_bus()

    # Analytics subscriber — logs all events (in-process, no durability needed)
    analytics = AnalyticsSubscriber()
    bus.subscribe(SubmissionSubmittedEvent, analytics.handle)
    bus.subscribe(GradePublishedEvent, analytics.handle)
    bus.subscribe(SubmissionReturnedEvent, analytics.handle)
    bus.subscribe(AssessmentPublishedEvent, analytics.handle)
    bus.subscribe(PolicyOverrideCreatedEvent, analytics.handle)
    bus.subscribe(FileSubmissionSubmittedEvent, analytics.handle)
    bus.subscribe(FileSubmissionGradedEvent, analytics.handle)
    bus.subscribe(FileSubmissionPublishedEvent, analytics.handle)
    bus.subscribe(FileSubmissionReturnedEvent, analytics.handle)

    # Durable XP award — enqueues a taskiq task (replaces XPAwardSubscriber)
    bus.subscribe(GradePublishedEvent, _enqueue_xp_award)

    # Durable plagiarism check — enqueues a taskiq task (replaces PlagiarismSubscriber)
    bus.subscribe(SubmissionSubmittedEvent, _enqueue_plagiarism_check)
    bus.subscribe(FileSubmissionSubmittedEvent, _enqueue_plagiarism_check)

    _registered = True
    logger.info("event_bus_subscribers_registered count=5")
