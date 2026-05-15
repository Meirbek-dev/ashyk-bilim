"""Event subscribers — side-effect handlers for assessment events.

Each subscriber is idempotent and keyed on submission_uuid to prevent
double-processing on replay.
"""

from src.services.events.subscribers.analytics import AnalyticsSubscriber
from src.services.events.subscribers.plagiarism import PlagiarismSubscriber
from src.services.events.subscribers.xp_award import XPAwardSubscriber

__all__ = [
    "AnalyticsSubscriber",
    "PlagiarismSubscriber",
    "XPAwardSubscriber",
]
