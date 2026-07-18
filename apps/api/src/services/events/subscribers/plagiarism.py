"""Pluggable plagiarism-provider selection."""

from __future__ import annotations

from typing import Protocol, override

from src.types import PlagiarismCheckResult


class PlagiarismProvider(Protocol):
    """Protocol for pluggable plagiarism detection providers."""

    async def check(self, submission_uuid: str, file_keys: list[str]) -> PlagiarismCheckResult:
        """Run a plagiarism check, or report that the provider is disabled."""
        raise NotImplementedError


class DisabledPlagiarismProvider(PlagiarismProvider):
    """Default provider used until a real integration is configured."""

    @override
    async def check(self, submission_uuid: str, file_keys: list[str]) -> PlagiarismCheckResult:
        return {"status": "disabled", "details": {"reason": "No plagiarism provider is configured"}}


# Config-driven provider selection
_provider: PlagiarismProvider | None = None


def get_plagiarism_provider() -> PlagiarismProvider:
    """Return the configured plagiarism provider."""
    global _provider
    if _provider is None:
        _provider = DisabledPlagiarismProvider()
    return _provider


def set_plagiarism_provider(provider: PlagiarismProvider) -> None:
    """Override the provider (for testing or config-driven selection)."""
    global _provider
    _provider = provider
