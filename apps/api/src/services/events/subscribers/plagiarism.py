"""Plagiarism check subscriber — delegates to pluggable provider.

Replaces the old stub in services/integrations/plagiarism.py.
"""

from __future__ import annotations

import logging

from src.services.events.types import (
    FileSubmissionSubmittedEvent,
    SubmissionSubmittedEvent,
)

logger = logging.getLogger(__name__)


class PlagiarismProvider:
    """Protocol for pluggable plagiarism detection providers."""

    async def check(self, submission_uuid: str, file_keys: list[str]) -> dict:
        """Run plagiarism check. Returns a result dict with at minimum {score, flagged}."""
        raise NotImplementedError


class NoopPlagiarismProvider(PlagiarismProvider):
    """Default no-op provider — logs and returns clean."""

    async def check(self, submission_uuid: str, file_keys: list[str]) -> dict:
        return {"score": 0.0, "flagged": False}


# Config-driven provider selection
_provider: PlagiarismProvider | None = None


def get_plagiarism_provider() -> PlagiarismProvider:
    """Return the configured plagiarism provider."""
    global _provider
    if _provider is None:
        _provider = NoopPlagiarismProvider()
    return _provider


def set_plagiarism_provider(provider: PlagiarismProvider) -> None:
    """Override the provider (for testing or config-driven selection)."""
    global _provider
    _provider = provider


class PlagiarismSubscriber:
    """Checks submissions with file uploads for plagiarism."""

    async def handle(self, event: SubmissionSubmittedEvent | FileSubmissionSubmittedEvent) -> None:
        """Only triggers when file_keys are present."""
        if not event.file_keys:
            return

        provider = get_plagiarism_provider()
        try:
            submission_uuid = getattr(event, "submission_uuid", None) or event.attempt_uuid
            result = await provider.check(submission_uuid, event.file_keys)
            logger.info(
                "plagiarism_check submission=%s score=%s flagged=%s",
                submission_uuid,
                result.get("score", 0),
                result.get("flagged", False),
            )
        except Exception as exc:
            logger.warning(
                "plagiarism_check_failed submission=%s error=%s",
                getattr(event, "submission_uuid", None) or getattr(event, "attempt_uuid", ""),
                exc,
            )
