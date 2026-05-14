"""Event bus startup — registers all subscribers.

Call `register_all_subscribers()` during application lifespan startup
to wire all event handlers to the bus.

Usage in lifespan.py:
    from src.services.events.startup import register_all_subscribers
    register_all_subscribers()
"""

from __future__ import annotations

import logging

from src.services.events.bus import get_event_bus
from src.services.events.subscribers.analytics import AnalyticsSubscriber
from src.services.events.subscribers.plagiarism import PlagiarismSubscriber
from src.services.events.subscribers.xp_award import XPAwardSubscriber
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


def register_all_subscribers() -> None:
    """Register all event subscribers with the application event bus.

    Idempotent — safe to call multiple times (only registers once).
    """
    global _registered
    if _registered:
        return

    bus = get_event_bus()

    # Analytics subscriber — logs all events
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

    # XP award — triggers on grade publication
    xp_award = XPAwardSubscriber()
    bus.subscribe(GradePublishedEvent, xp_award.handle)

    # Plagiarism check — triggers on submission with file uploads
    plagiarism = PlagiarismSubscriber()
    bus.subscribe(SubmissionSubmittedEvent, plagiarism.handle)
    bus.subscribe(FileSubmissionSubmittedEvent, plagiarism.handle)

    _registered = True
    logger.info("event_bus_subscribers_registered count=5")
