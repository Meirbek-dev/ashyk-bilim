"""
Quiz-specific grading logic.

Adapted from services/blocks/block_types/quizBlock/grading.py with:
- Typed GradedItem output (no raw dicts)
- apply_attempt_penalty kept as-is
- open-text answers now produce a ManualReviewItem instead of silently scoring 0
"""

from typing import Any

from src.db.grading.submissions import GradedItem, GradingBreakdown


def grade_quiz_questions(
    questions: list[dict],
    user_answers: list[dict],
    max_score: float = 100.0,
) -> tuple[float, GradingBreakdown]:
    """
    Grade quiz questions and return (auto_score, GradingBreakdown).

    Returns 0.0 auto_score and needs_manual_review=True if any open-text
    questions are present — these must be reviewed in the teacher grading panel.
    """
    if not questions:
        return 0.0, GradingBreakdown(
            items=[], needs_manual_review=False, auto_graded=True
        )

    answer_lookup: dict[str, dict] = {
        ans.get("question_id", ""): ans for ans in user_answers
    }

    total_defined_points = sum(float(q.get("points", 0)) for q in questions)
    points_per_question: float | None = (
        None if total_defined_points > 0 else max_score / len(questions)
    )

    total_score = 0.0
    items: list[GradedItem] = []
    needs_manual_review = False

    for question in questions:
        question_id: str = question.get("question_id") or question.get(
            "questionUUID", ""
        )
        question_type: str = question.get("type", "multiple_choice")

        # Compute points for this question
        q_pts_raw = question.get("points")
        if q_pts_raw is not None and total_defined_points > 0:
            q_points = (float(q_pts_raw) / total_defined_points) * max_score
        else:
            q_points = points_per_question or 0.0

        user_answer = answer_lookup.get(question_id, {})

        if question_type == "multiple_choice":
            item = _grade_multiple_choice(question, user_answer, q_points)
        elif question_type == "custom_answer":
            item = _grade_open_text(question, user_answer, q_points)
            needs_manual_review = True
        else:
            item = GradedItem(
                item_id=question_id,
                item_text=question.get("question") or question.get("questionText", ""),
                score=0.0,
                max_score=q_points,
                correct=False,
                feedback="Unknown question type — skipped",
                needs_manual_review=False,
            )

        total_score += item.score
        items.append(item)

    breakdown = GradingBreakdown(
        items=items,
        needs_manual_review=needs_manual_review,
        auto_graded=not needs_manual_review,
    )
    return round(total_score, 2), breakdown


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


# ── Internal helpers ─────────────────────────────────────────────────────────


def _grade_multiple_choice(
    question: dict[str, Any],
    user_answer: dict[str, Any],
    points: float,
) -> GradedItem:
    question_id: str = question.get("question_id") or question.get("questionUUID", "")
    question_text: str = question.get("question") or question.get("questionText", "")
    options: list[dict] = question.get("answers") or question.get("options", [])

    correct_option_ids: set[str] = set()
    for opt in options:
        opt_id = (
            opt.get("answer_id")
            or opt.get("optionUUID")
            or opt.get("option_id")
            or opt.get("id", "")
        )
        is_correct = opt.get("correct") or opt.get("assigned_right_answer", False)
        if is_correct and opt_id:
            correct_option_ids.add(str(opt_id))

    # TODO: consolidate to a single canonical field name once all clients are
    # updated to send `selected_option_ids` only. These aliases exist due to
    # accumulated schema drift across prior quiz block implementations.
    raw_selected: Any = (
        user_answer.get("selected_option_ids")  # canonical — use this going forward
        or user_answer.get("selected_option_id")
        or user_answer.get("selected_options")
        or user_answer.get("selected_options_id")
        or user_answer.get("answer_id")
        or user_answer.get("selected_option")
    )

    if not raw_selected:
        return GradedItem(
            item_id=question_id,
            item_text=question_text,
            score=0.0,
            max_score=points,
            correct=False,
            feedback="No answer provided",
            user_answer=None,
            correct_answer=list(correct_option_ids),
        )

    user_selected: set[str] = (
        {str(s) for s in raw_selected}
        if isinstance(raw_selected, list)
        else {str(raw_selected)}
    )

    if not correct_option_ids:
        score, correct, feedback = points, True, "No correct answer defined"
    elif user_selected == correct_option_ids:
        score, correct, feedback = points, True, "Correct"
    elif user_selected & correct_option_ids:
        correct_count = len(user_selected & correct_option_ids)
        incorrect_count = len(user_selected - correct_option_ids)
        partial = (correct_count / len(correct_option_ids)) * points
        penalty = (incorrect_count / max(len(options), 1)) * points * 0.5
        score = max(0.0, partial - penalty)
        correct = False
        feedback = f"Partially correct ({correct_count}/{len(correct_option_ids)})"
    else:
        score, correct, feedback = 0.0, False, "Incorrect"

    return GradedItem(
        item_id=question_id,
        item_text=question_text,
        score=round(score, 2),
        max_score=points,
        correct=correct,
        feedback=feedback,
        user_answer=list(user_selected),
        correct_answer=list(correct_option_ids),
    )


def _grade_open_text(
    question: dict[str, Any],
    user_answer: dict[str, Any],
    points: float,
) -> GradedItem:
    """
    Open-text questions require manual review.

    Score is 0 until the teacher sets it via the grading panel.
    The item is flagged with needs_manual_review=True so the panel
    surfaces it prominently.
    """
    question_id: str = question.get("question_id") or question.get("questionUUID", "")
    question_text: str = question.get("question") or question.get("questionText", "")
    user_text: str = user_answer.get("answer", "") or ""

    return GradedItem(
        item_id=question_id,
        item_text=question_text,
        score=0.0,
        max_score=points,
        correct=None,
        feedback="Requires manual review",
        user_answer=user_text,
        correct_answer=None,
        needs_manual_review=True,
    )
