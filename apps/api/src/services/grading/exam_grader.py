"""
Exam-specific grading logic.

Exams use the same multiple-choice engine as quizzes but pull their
questions from the Exam/Question tables rather than a block's JSON content.
"""

from src.db.grading.submissions import GradedItem, GradingBreakdown
from src.services.grading.quiz_grader import (
    _grade_multiple_choice,
    _grade_open_text,
)


def grade_exam_questions(
    questions: list[dict],
    submitted_answers: dict[int, dict],
    max_score: float = 100.0,
) -> tuple[float, GradingBreakdown]:
    """
    Grade an exam submission.

    Args:
        questions:         List of question dicts from the Exam/Question table.
        submitted_answers: Mapping of question_id → answer dict from the student.
        max_score:         Total points the exam is worth.

    Returns:
        (auto_score, GradingBreakdown)
    """
    if not questions:
        return 0.0, GradingBreakdown(
            items=[], needs_manual_review=False, auto_graded=True
        )

    total_defined_points = sum(float(q.get("points", 0)) for q in questions)
    items: list[GradedItem] = []
    total_score = 0.0
    needs_manual_review = False

    for question in questions:
        qid = question.get("id") or question.get("question_uuid", "")
        q_pts_raw = float(question.get("points", 0))

        # Scale to max_score
        if total_defined_points > 0:
            q_points = (q_pts_raw / total_defined_points) * max_score
        else:
            q_points = max_score / len(questions)

        user_answer = submitted_answers.get(int(qid) if str(qid).isdigit() else 0, {})

        question_type = question.get("question_type", "SINGLE_CHOICE").upper()

        if question_type in ("SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"):
            # Convert exam question format to grading format
            quiz_fmt_question = _exam_question_to_quiz_format(question)
            item = _grade_multiple_choice(quiz_fmt_question, user_answer, q_points)
            # Override item_id to use exam question id
            item = GradedItem(
                item_id=str(qid),
                item_text=item.item_text,
                score=item.score,
                max_score=item.max_score,
                correct=item.correct,
                feedback=item.feedback,
                user_answer=item.user_answer,
                correct_answer=item.correct_answer,
                needs_manual_review=False,
            )
        else:
            # MATCHING or other types that need manual review
            item = _grade_open_text(
                {
                    "question_id": str(qid),
                    "question": question.get("question_text", ""),
                },
                user_answer,
                q_points,
            )
            needs_manual_review = True

        total_score += item.score
        items.append(item)

    breakdown = GradingBreakdown(
        items=items,
        needs_manual_review=needs_manual_review,
        auto_graded=not needs_manual_review,
    )
    return round(total_score, 2), breakdown


def _exam_question_to_quiz_format(question: dict) -> dict:
    """
    Convert an Exam Question record to the format expected by _grade_multiple_choice.
    """
    answer_options = question.get("answer_options", [])
    quiz_options = [
        {
            "answer_id": str(i),
            "text": opt.get("text", ""),
            "correct": opt.get("is_correct", False),
        }
        for i, opt in enumerate(answer_options)
    ]
    return {
        "question_id": str(question.get("id") or question.get("question_uuid", "")),
        "question": question.get("question_text", ""),
        "type": "multiple_choice",
        "answers": quiz_options,
    }
