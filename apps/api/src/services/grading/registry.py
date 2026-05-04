"""Pluggable grader registry for assessment-type dispatch."""

from abc import ABC, abstractmethod
from typing import Any, ClassVar

from pydantic import BaseModel

from src.db.grading.submissions import AssessmentType, GradedItem, GradingBreakdown
from src.services.grading.code_grader import (
    grade_canonical_code_item,
    grade_code_challenge,
)
from src.services.grading.exam_grader import grade_exam_questions
from src.services.grading.quiz_grader import (
    apply_attempt_penalty,
    grade_canonical_choice_items,
    grade_quiz_questions,
)


class GradingResult(BaseModel):
    auto_score: float
    breakdown: GradingBreakdown
    needs_manual_review: bool


class BaseGrader(ABC):
    @abstractmethod
    def grade(self, **kwargs: Any) -> GradingResult:
        """Grade an assessment attempt and return a normalized result."""


class GraderRegistry:
    _graders: ClassVar[dict[AssessmentType, type[BaseGrader]]] = {}

    @classmethod
    def register(cls, assessment_type: AssessmentType):
        def decorator(grader_cls: type[BaseGrader]) -> type[BaseGrader]:
            cls._graders[assessment_type] = grader_cls
            return grader_cls

        return decorator

    @classmethod
    def get(cls, assessment_type: AssessmentType) -> BaseGrader:
        grader_cls = cls._graders.get(assessment_type, ManualReviewGrader)
        return grader_cls()

    @classmethod
    def grade(cls, assessment_type: AssessmentType, **kwargs: Any) -> GradingResult:
        return cls.get(assessment_type).grade(**kwargs)


@GraderRegistry.register(AssessmentType.QUIZ)
class QuizGrader(BaseGrader):
    def grade(self, **kwargs: Any) -> GradingResult:
        items = kwargs.get("items") or []
        answers_by_item_uuid = kwargs.get("answers_by_item_uuid") or {}
        if items:
            raw_score, breakdown = grade_canonical_choice_items(
                items=items,
                answers_by_item_uuid=answers_by_item_uuid,
                max_score=kwargs.get("max_score", 100.0),
            )
        else:
            raw_score, breakdown = grade_quiz_questions(
                questions=kwargs.get("questions") or [],
                user_answers=kwargs.get("user_answers") or [],
                max_score=kwargs.get("max_score", 100.0),
            )
        penalized = apply_attempt_penalty(
            base_score=raw_score,
            attempt_number=kwargs.get("attempt_number", 1),
            max_score_penalty_per_attempt=kwargs.get("max_score_penalty_per_attempt"),
        )
        return GradingResult(
            auto_score=penalized,
            breakdown=breakdown,
            needs_manual_review=breakdown.needs_manual_review,
        )


@GraderRegistry.register(AssessmentType.EXAM)
class ExamGrader(BaseGrader):
    def grade(self, **kwargs: Any) -> GradingResult:
        items = kwargs.get("items") or []
        answers_by_item_uuid = kwargs.get("answers_by_item_uuid") or {}
        if items:
            raw_score, breakdown = grade_canonical_choice_items(
                items=items,
                answers_by_item_uuid=answers_by_item_uuid,
                max_score=kwargs.get("max_score", 100.0),
            )
        else:
            raw_score, breakdown = grade_exam_questions(
                questions=kwargs.get("questions") or [],
                submitted_answers=kwargs.get("exam_answers") or {},
                max_score=kwargs.get("max_score", 100.0),
            )
        return GradingResult(
            auto_score=raw_score,
            breakdown=breakdown,
            needs_manual_review=breakdown.needs_manual_review,
        )


@GraderRegistry.register(AssessmentType.CODE_CHALLENGE)
class CodeChallengeGrader(BaseGrader):
    def grade(self, **kwargs: Any) -> GradingResult:
        items = kwargs.get("items") or []
        answers_by_item_uuid = kwargs.get("answers_by_item_uuid") or {}
        if items:
            auto_score, breakdown = grade_canonical_code_item(
                items=items,
                answers_by_item_uuid=answers_by_item_uuid,
                strategy=kwargs.get("code_strategy", "BEST_SUBMISSION"),
            )
        else:
            auto_score, breakdown = grade_code_challenge(
                test_results=kwargs.get("test_results") or [],
                strategy=kwargs.get("code_strategy", "BEST_SUBMISSION"),
            )
        return GradingResult(
            auto_score=auto_score,
            breakdown=breakdown,
            needs_manual_review=breakdown.needs_manual_review,
        )


@GraderRegistry.register(AssessmentType.ASSIGNMENT)
class ManualReviewGrader(BaseGrader):
    def grade(self, **_kwargs: Any) -> GradingResult:
        items = _kwargs.get("items") or []
        answers_by_item_uuid = _kwargs.get("answers_by_item_uuid") or {}
        if items:
            empty_breakdown = GradingBreakdown(
                items=[
                    GradedItem(
                        item_id=item.item_uuid,
                        item_text=item.title or getattr(item.body, "prompt", ""),
                        score=0.0,
                        max_score=float(item.max_score or 0),
                        correct=None,
                        feedback="",
                        needs_manual_review=True,
                        user_answer=answers_by_item_uuid.get(item.item_uuid),
                    )
                    for item in items
                ],
                needs_manual_review=True,
                auto_graded=False,
            )
        else:
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
