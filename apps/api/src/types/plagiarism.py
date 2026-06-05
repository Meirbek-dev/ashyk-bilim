"""Plagiarism types."""

from typing import TypedDict


class PlagiarismCheckResult(TypedDict, total=False):
    score: float
    flagged: bool
    details: dict[str, object]


__all__ = ["PlagiarismCheckResult"]
