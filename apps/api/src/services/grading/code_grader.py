"""
Code-challenge grading logic.

Routes test-case results through a strategy pattern. Imported from the
existing code_challenges grading logic and re-exported through the unified
grading interface.
"""

from typing import Any

from src.db.assessments import CodeItemAnswer
from src.db.grading.submissions import GradedItem, GradingBreakdown
from src.services.grading.settings_loader import CanonicalAssessmentItem


def grade_code_challenge(
    test_results: list[dict],
    strategy: str = "BEST_SUBMISSION",
) -> tuple[float, GradingBreakdown]:
    """
    Grade a code challenge submission.

    Args:
        test_results: List of {test_id, passed, weight} dicts from the test runner.
        strategy:     Scoring strategy (BEST_SUBMISSION, ALL_OR_NOTHING,
                      LATEST_SUBMISSION, PARTIAL_CREDIT).

    Returns:
        (auto_score 0–100, GradingBreakdown)
    """
    if not test_results:
        return 0.0, GradingBreakdown(
            items=[], needs_manual_review=False, auto_graded=True
        )

    total_weight = sum(float(t.get("weight", 1)) for t in test_results)
    if total_weight == 0:
        total_weight = len(test_results)

    earned_weight = sum(
        float(t.get("weight", 1)) for t in test_results if t.get("passed", False)
    )

    raw_score = (earned_weight / total_weight) * 100

    strategy_upper = strategy.upper()
    if strategy_upper == "ALL_OR_NOTHING":
        auto_score = 100.0 if raw_score >= 100.0 else 0.0
    else:
        auto_score = raw_score

    items = [
        GradedItem(
            item_id=str(t.get("test_id", i)),
            item_text=t.get("description", f"Test {i + 1}"),
            score=float(t.get("weight", 1)) if t.get("passed") else 0.0,
            max_score=float(t.get("weight", 1)),
            correct=bool(t.get("passed", False)),
            feedback=t.get("message", ""),
            needs_manual_review=False,
        )
        for i, t in enumerate(test_results)
    ]

    breakdown = GradingBreakdown(
        items=items,
        needs_manual_review=False,
        auto_graded=True,
    )
    return round(auto_score, 2), breakdown


def grade_canonical_code_item(
    items: list[CanonicalAssessmentItem],
    answers_by_item_uuid: dict[str, Any],
    strategy: str = "BEST_SUBMISSION",
) -> tuple[float, GradingBreakdown]:
    """Grade canonical CODE items using answer.latest_run when present."""

    code_items = [item for item in items if item.body.kind == "CODE"]
    if not code_items:
        return 0.0, GradingBreakdown(
            items=[], needs_manual_review=False, auto_graded=True
        )

    if len(code_items) > 1:
        return 0.0, GradingBreakdown(
            items=[
                GradedItem(
                    item_id=item.item_uuid,
                    item_text=item.title or item.body.prompt,
                    score=0.0,
                    max_score=float(item.max_score or 0),
                    correct=None,
                    feedback="Requires manual review",
                    needs_manual_review=True,
                )
                for item in code_items
            ],
            needs_manual_review=True,
            auto_graded=False,
        )

    item = code_items[0]
    raw_answer = answers_by_item_uuid.get(item.item_uuid)
    latest_run = _extract_latest_run(raw_answer)
    if latest_run is None:
        return 0.0, GradingBreakdown(
            items=[
                GradedItem(
                    item_id=item.item_uuid,
                    item_text=item.title or item.body.prompt,
                    score=0.0,
                    max_score=float(item.max_score or 0),
                    correct=None,
                    feedback="Requires manual review",
                    needs_manual_review=True,
                    user_answer=_serialize_code_answer(raw_answer),
                )
            ],
            needs_manual_review=True,
            auto_graded=False,
        )

    details = latest_run.get("details")
    test_results = details if isinstance(details, list) else []
    auto_score, breakdown = grade_code_challenge(test_results, strategy=strategy)
    if breakdown.items:
        return auto_score, breakdown

    item_score = latest_run.get("score")
    normalized_score = float(item_score) if isinstance(item_score, (int, float)) else auto_score
    item_breakdown = GradingBreakdown(
        items=[
            GradedItem(
                item_id=item.item_uuid,
                item_text=item.title or item.body.prompt,
                score=normalized_score,
                max_score=100.0,
                correct=(latest_run.get("passed") == latest_run.get("total")) if latest_run.get("total") else None,
                feedback="",
                user_answer=_serialize_code_answer(raw_answer),
            )
        ],
        needs_manual_review=False,
        auto_graded=True,
    )
    return normalized_score, item_breakdown


def _extract_latest_run(raw_answer: Any) -> dict[str, Any] | None:
    if isinstance(raw_answer, CodeItemAnswer):
        latest_run = raw_answer.latest_run
        return latest_run.model_dump(mode="json") if latest_run is not None else None
    if isinstance(raw_answer, dict):
        latest_run = raw_answer.get("latest_run")
        if isinstance(latest_run, dict):
            return latest_run
    return None


def _serialize_code_answer(raw_answer: Any) -> Any:
    if isinstance(raw_answer, CodeItemAnswer):
        return raw_answer.model_dump(mode="json")
    return raw_answer
