"""
Unified grading dispatcher.

Single entry point for all assessment types. Replaces the three separate,
isolated grading engines that previously shared no code.
"""

from pydantic import BaseModel

from src.db.grading.submissions import AssessmentType, GradingBreakdown
from src.services.grading.code_grader import grade_code_challenge
from src.services.grading.exam_grader import grade_exam_questions
from src.services.grading.quiz_grader import apply_attempt_penalty, grade_quiz_questions


class GradingResult(BaseModel):
    auto_score: float
    breakdown: GradingBreakdown
    needs_manual_review: bool


def grade_submission(
    assessment_type: AssessmentType,
    *,
    # Quiz / Exam
    questions: list[dict] | None = None,
    user_answers: list[dict] | None = None,
    exam_answers: dict[int, dict] | None = None,
    # Code challenge
    test_results: list[dict] | None = None,
    code_strategy: str = "BEST_SUBMISSION",
    # Shared
    attempt_number: int = 1,
    max_score_penalty_per_attempt: float | None = None,
    max_score: float = 100.0,
) -> GradingResult:
    """
    Grade a submission for any assessment type.

    Args:
        assessment_type:               Which type of assessment.
        questions:                     Question list (quiz/exam).
        user_answers:                  List of answer dicts (quiz format).
        exam_answers:                  Mapping of question_id → answer (exam format).
        test_results:                  Test-case results (code challenge).
        code_strategy:                 Scoring strategy for code challenges.
        attempt_number:                1-indexed attempt number (for penalty).
        max_score_penalty_per_attempt: Penalty % per additional attempt.
        max_score:                     Maximum possible score (default 100).

    Returns:
        GradingResult with auto_score, breakdown, and needs_manual_review.
    """
    match assessment_type:
        case AssessmentType.QUIZ:
            raw_score, breakdown = grade_quiz_questions(
                questions=questions or [],
                user_answers=user_answers or [],
                max_score=max_score,
            )
            penalized = apply_attempt_penalty(
                base_score=raw_score,
                attempt_number=attempt_number,
                max_score_penalty_per_attempt=max_score_penalty_per_attempt,
            )
            return GradingResult(
                auto_score=penalized,
                breakdown=breakdown,
                needs_manual_review=breakdown.needs_manual_review,
            )

        case AssessmentType.EXAM:
            raw_score, breakdown = grade_exam_questions(
                questions=questions or [],
                submitted_answers=exam_answers or {},
                max_score=max_score,
            )
            return GradingResult(
                auto_score=raw_score,
                breakdown=breakdown,
                needs_manual_review=breakdown.needs_manual_review,
            )

        case AssessmentType.CODE_CHALLENGE:
            auto_score, breakdown = grade_code_challenge(
                test_results=test_results or [],
                strategy=code_strategy,
            )
            return GradingResult(
                auto_score=auto_score,
                breakdown=breakdown,
                needs_manual_review=False,
            )

        case AssessmentType.ASSIGNMENT:
            # Assignments are always manually graded by the teacher.
            empty_breakdown = GradingBreakdown(
                items=[],
                needs_manual_review=True,
                auto_graded=False,
            )
            return GradingResult(
                auto_score=0.0,
                breakdown=empty_breakdown,
                needs_manual_review=True,
            )

        case _:
            empty_breakdown = GradingBreakdown(
                items=[],
                needs_manual_review=True,
                auto_graded=False,
            )
            return GradingResult(
                auto_score=0.0,
                breakdown=empty_breakdown,
                needs_manual_review=True,
            )
