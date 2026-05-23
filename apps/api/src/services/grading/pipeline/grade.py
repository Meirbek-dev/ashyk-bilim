"""Pipeline stage: dispatch grading to the registry.

Constructs a GradingContext and delegates to the appropriate grader.
"""

from __future__ import annotations

from typing import Any

from src.db.grading.submissions import AssessmentType
from src.services.grading.pipeline.context import GradingContext
from src.services.grading.registry import GraderRegistry, GradingResult
from src.services.grading.settings_loader import CanonicalAssessmentItem


def grade_attempt(
    assessment_type: AssessmentType,
    items: list[CanonicalAssessmentItem],
    answers_by_item_uuid: dict[str, Any],
    attempt_number: int,
    *,
    max_score: float = 100.0,
    code_strategy: str = "BEST_SUBMISSION",
    max_score_penalty_per_attempt: float | None = None,
    negative_marking_percent: float = 0.0,
) -> GradingResult:
    """Build a GradingContext and dispatch to the registered grader."""
    ctx = GradingContext(
        assessment_type=assessment_type,
        items=items,
        answers_by_item_uuid=answers_by_item_uuid,
        attempt_number=attempt_number,
        max_score=max_score,
        code_strategy=code_strategy,
        max_score_penalty_per_attempt=max_score_penalty_per_attempt,
        negative_marking_percent=negative_marking_percent,
    )
    return grade_with_context(ctx)


def grade_with_context(ctx: GradingContext) -> GradingResult:
    """Grade using a pre-built context. Useful for testing."""
    grader = GraderRegistry.get(ctx.assessment_type)
    return grader.grade(ctx)
