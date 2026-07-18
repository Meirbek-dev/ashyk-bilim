"""Plagiarism types."""

from typing import Literal, TypedDict


class PlagiarismCheckResult(TypedDict, total=False):
    status: Literal["completed", "disabled"]
    score: float
    flagged: bool
    details: dict[str, object]


__all__ = ["PlagiarismCheckResult"]
