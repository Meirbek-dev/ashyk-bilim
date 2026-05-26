"""Canonical quiz/exam item grading logic."""

from typing import Any

from src.db.assessments import ChoiceItemAnswer, MatchingItemAnswer
from src.db.grading.submissions import GradedItem, GradingBreakdown
from src.services.grading.settings_loader import CanonicalAssessmentItem


def apply_attempt_penalty(
    base_score: float,
    attempt_number: int,
    max_score_penalty_per_attempt: float | None,
) -> float:
    """Cap the score based on attempt-number penalty."""
    if not max_score_penalty_per_attempt or attempt_number <= 1:
        return base_score

    penalty_multiplier = attempt_number - 1
    max_score_reduction = max_score_penalty_per_attempt * penalty_multiplier
    penalized_max = max(0.0, 100.0 - max_score_reduction)
    return min(base_score, penalized_max)


def grade_canonical_choice_items(
    items: list[CanonicalAssessmentItem],
    answers_by_item_uuid: dict[str, Any],
    max_score: float = 100.0,
    negative_marking_percent: float = 0.0,
) -> tuple[float, GradingBreakdown]:
    """Grade canonical CHOICE and MATCHING items from answers[item_uuid]."""

    gradable_items = [
        item for item in items if item.body.kind in {"CHOICE", "MATCHING"}
    ]
    if not gradable_items:
        return 0.0, GradingBreakdown(
            items=[], needs_manual_review=False, auto_graded=True
        )

    total_defined_points = sum(float(item.max_score or 0) for item in gradable_items)
    points_per_item = (
        None if total_defined_points > 0 else max_score / len(gradable_items)
    )

    total_score = 0.0
    breakdown_items: list[GradedItem] = []

    for item in gradable_items:
        item_points = (
            (float(item.max_score or 0) / total_defined_points) * max_score
            if total_defined_points > 0
            else (points_per_item or 0.0)
        )
        answer = answers_by_item_uuid.get(item.item_uuid)
        if item.body.kind == "CHOICE":
            graded = _grade_canonical_choice(
                item, answer, item_points, negative_marking_percent
            )
        else:
            graded = _grade_canonical_matching(item, answer, item_points)
        total_score += graded.score
        breakdown_items.append(graded)

    return round(total_score, 2), GradingBreakdown(
        items=breakdown_items,
        needs_manual_review=False,
        auto_graded=True,
    )


def _grade_canonical_choice(
    item: CanonicalAssessmentItem,
    raw_answer: Any,
    points: float,
    negative_marking_percent: float = 0.0,
) -> GradedItem:
    selected = []
    if isinstance(raw_answer, ChoiceItemAnswer):
        selected = [str(option_id) for option_id in raw_answer.selected]
    elif isinstance(raw_answer, dict):
        raw_selected = raw_answer.get("selected")
        if isinstance(raw_selected, list):
            selected = [str(option_id) for option_id in raw_selected]

    correct_option_ids = {
        str(option.id) for option in item.body.options if option.is_correct
    }

    if not selected:
        return GradedItem(
            item_id=item.item_uuid,
            item_text=item.title or item.body.prompt,
            score=0.0,
            max_score=points,
            correct=False,
            feedback="No answer provided",
            user_answer=[],
            correct_answer=list(correct_option_ids),
        )

    user_selected = set(selected)
    if not correct_option_ids:
        score, correct, feedback = points, True, "No correct answer defined"
    elif user_selected == correct_option_ids:
        score, correct, feedback = points, True, "Correct"
    elif user_selected & correct_option_ids:
        correct_count = len(user_selected & correct_option_ids)
        incorrect_count = len(user_selected - correct_option_ids)
        partial = (correct_count / len(correct_option_ids)) * points
        penalty = (incorrect_count / max(len(item.body.options), 1)) * points * 0.5
        score = max(0.0, partial - penalty)
        correct = False
        feedback = f"Partially correct ({correct_count}/{len(correct_option_ids)})"
    else:
        # Fully wrong — apply negative marking if configured
        deduction = (
            (negative_marking_percent / 100.0) * points
            if negative_marking_percent > 0
            else 0.0
        )
        score = max(-points, -deduction)
        correct = False
        feedback = (
            "Incorrect"
            if deduction == 0.0
            else f"Incorrect (−{round(deduction, 2)} pts)"
        )

    return GradedItem(
        item_id=item.item_uuid,
        item_text=item.title or item.body.prompt,
        score=round(score, 2),
        max_score=points,
        correct=correct,
        feedback=feedback,
        user_answer=selected,
        correct_answer=list(correct_option_ids),
    )


def _grade_canonical_matching(
    item: CanonicalAssessmentItem,
    raw_answer: Any,
    points: float,
) -> GradedItem:
    submitted_pairs: dict[str, str] = {}
    if isinstance(raw_answer, MatchingItemAnswer):
        submitted_pairs = {pair.left: pair.right for pair in raw_answer.matches}
    elif isinstance(raw_answer, dict) and isinstance(raw_answer.get("matches"), list):
        submitted_pairs = {
            str(pair.get("left", "")): str(pair.get("right", ""))
            for pair in raw_answer["matches"]
            if isinstance(pair, dict)
        }

    expected_pairs = {pair.left: pair.right for pair in item.body.pairs}
    if not submitted_pairs:
        return GradedItem(
            item_id=item.item_uuid,
            item_text=item.title or item.body.prompt,
            score=0.0,
            max_score=points,
            correct=False,
            feedback="No answer provided",
            user_answer=[],
            correct_answer=item.body.model_dump(mode="json").get("pairs", []),
        )

    correct_count = sum(
        1
        for left, right in expected_pairs.items()
        if submitted_pairs.get(left) == right
    )
    total_pairs = max(len(expected_pairs), 1)
    score = round((correct_count / total_pairs) * points, 2)
    correct = correct_count == len(expected_pairs)

    return GradedItem(
        item_id=item.item_uuid,
        item_text=item.title or item.body.prompt,
        score=score,
        max_score=points,
        correct=correct,
        feedback="Correct"
        if correct
        else f"Matched {correct_count}/{len(expected_pairs)} pairs",
        user_answer=[
            {"left": left, "right": right} for left, right in submitted_pairs.items()
        ],
        correct_answer=item.body.model_dump(mode="json").get("pairs", []),
    )
