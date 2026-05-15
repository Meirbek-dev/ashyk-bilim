"""Formalized event bus for assessment grading side-effects.

All post-submission actions (XP, plagiarism, notifications, analytics, SSE)
subscribe to typed events and run asynchronously after the main transaction
commits.
"""

from src.services.events.bus import EventBus, get_event_bus
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

__all__ = [
    "AssessmentPublishedEvent",
    "EventBus",
    "FileSubmissionGradedEvent",
    "FileSubmissionPublishedEvent",
    "FileSubmissionReturnedEvent",
    "FileSubmissionSubmittedEvent",
    "GradePublishedEvent",
    "PolicyOverrideCreatedEvent",
    "SubmissionReturnedEvent",
    "SubmissionSubmittedEvent",
    "get_event_bus",
]
