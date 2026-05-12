"""Grading dispatcher facade.

Thin wrapper around the pipeline's grade stage for backward compatibility
with callers that haven't migrated to the pipeline orchestrator yet.
"""

from typing import Any

from src.db.grading.submissions import AssessmentType
from src.services.grading.pipeline.context import GradingContext
from src.services.grading.pipeline.grade import grade_attempt
from src.services.grading.registry import GradingResult


def grade_submission(
    assessment_type: AssessmentType,
    items: list | None = None,
    answers_by_item_uuid: dict[str, Any] | None = None,
    attempt_number: int = 1,
    max_score: float = 100.0,
    code_strategy: str = "BEST_SUBMISSION",
    max_score_penalty_per_attempt: float | None = None,
    **_kwargs: object,
) -> GradingResult:
    """Grade a submission by delegating to the pipeline grade stage.

    This facade exists for backward compatibility with the old submit.py
    orchestrator. New code should use pipeline/orchestrator.py directly.
    """
    return grade_attempt(
        assessment_type=assessment_type,
        items=items or [],
        answers_by_item_uuid=answers_by_item_uuid or {},
        attempt_number=attempt_number,
        max_score=max_score,
        code_strategy=code_strategy,
        max_score_penalty_per_attempt=max_score_penalty_per_attempt,
    )


__all__ = ["GradingResult", "grade_submission"]
