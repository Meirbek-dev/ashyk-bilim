"""
Code-challenge grading logic.

Routes test-case results through a strategy pattern. Imported from the
existing code_challenges grading logic and re-exported through the unified
grading interface.
"""

from src.db.grading.submissions import GradedItem, GradingBreakdown


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
