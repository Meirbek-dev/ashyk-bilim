"""Typed dataclasses for the grading pipeline.

These are the contracts between pipeline stages. Each stage receives and
returns well-typed data — no **kwargs, no raw dicts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from src.db.grading.progress import LatePolicy, LatePolicyNone
from src.db.grading.submissions import AssessmentType
from src.services.grading.settings_loader import CanonicalAssessmentItem
from src.types import JsonObject, JsonValue


@dataclass(frozen=True, slots=True)
class GradingContext:
    """Typed input for all graders — replaces **kwargs."""

    assessment_type: AssessmentType
    items: list[CanonicalAssessmentItem]
    answers_by_item_uuid: dict[str, JsonValue]
    attempt_number: int
    max_score: float = 100.0
    code_strategy: str = "BEST_SUBMISSION"
    max_score_penalty_per_attempt: float | None = None
    negative_marking_percent: float = 0.0


@dataclass(frozen=True, slots=True)
class ParsedAnswers:
    """Output of the validate stage."""

    answers_by_item_uuid: dict[str, JsonValue]
    raw_payload: JsonObject = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class EffectivePolicy:
    """Resolved policy after applying per-student overrides."""

    max_attempts: int | None = None
    time_limit_seconds: int | None = None
    due_at: datetime | None = None
    late_policy: LatePolicy = field(default_factory=LatePolicyNone)
    allow_late: bool = True
    passing_score: float = 60.0


@dataclass(frozen=True, slots=True)
class PenaltyResult:
    """Output of the penalize stage."""

    late_penalty_pct: float = 0.0
    attempt_penalty_applied: bool = False
    final_score: float = 0.0
    violation_zeroed: bool = False
