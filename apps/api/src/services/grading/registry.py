"""Pluggable grader registry for assessment-type dispatch."""

from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import ClassVar, override

from pydantic import BaseModel

from src.db.grading.submissions import AssessmentType, GradedItem, GradingBreakdown
from src.services.grading.code_grader import (
    grade_canonical_code_item,
    grade_code_challenge,
)
from src.services.grading.pipeline.context import GradingContext
from src.services.grading.quiz_grader import (
    apply_attempt_penalty,
    grade_canonical_choice_items,
)
from src.types.narrowing import as_json_value


class GradingResult(BaseModel):
    auto_score: float
    breakdown: GradingBreakdown
    needs_manual_review: bool


class BaseGrader(ABC):
    @abstractmethod
    def grade(self, ctx: GradingContext) -> GradingResult:
        """Grade an assessment attempt and return a normalized result."""


class GraderRegistry:
    _graders: ClassVar[dict[AssessmentType, type[BaseGrader]]] = {}

    @classmethod
    def register(cls, assessment_type: AssessmentType) -> Callable[[type[BaseGrader]], type[BaseGrader]]:
        def decorator(grader_cls: type[BaseGrader]) -> type[BaseGrader]:
            cls._graders[assessment_type] = grader_cls
            return grader_cls

        return decorator

    @classmethod
    def get(cls, assessment_type: AssessmentType) -> BaseGrader:
        grader_cls = cls._graders.get(assessment_type, ManualReviewGrader)
        return grader_cls()

    @classmethod
    def grade(cls, assessment_type: AssessmentType, ctx: GradingContext) -> GradingResult:
        return cls.get(assessment_type).grade(ctx)


@GraderRegistry.register(AssessmentType.QUIZ)
class QuizGrader(BaseGrader):
    @override
    def grade(self, ctx: GradingContext) -> GradingResult:
        if ctx.items:
            raw_score, breakdown = grade_canonical_choice_items(
                items=ctx.items,
                answers_by_item_uuid=ctx.answers_by_item_uuid,
                max_score=ctx.max_score,
                negative_marking_percent=ctx.negative_marking_percent,
            )
        else:
            raw_score = 0.0
            breakdown = GradingBreakdown(items=[], needs_manual_review=True, auto_graded=False)
        penalized = apply_attempt_penalty(
            base_score=raw_score,
            attempt_number=ctx.attempt_number,
            max_score_penalty_per_attempt=ctx.max_score_penalty_per_attempt,
        )
        return GradingResult(
            auto_score=penalized,
            breakdown=breakdown,
            needs_manual_review=breakdown.needs_manual_review,
        )


@GraderRegistry.register(AssessmentType.EXAM)
class ExamGrader(BaseGrader):
    @override
    def grade(self, ctx: GradingContext) -> GradingResult:
        if ctx.items:
            raw_score, breakdown = grade_canonical_choice_items(
                items=ctx.items,
                answers_by_item_uuid=ctx.answers_by_item_uuid,
                max_score=ctx.max_score,
                negative_marking_percent=ctx.negative_marking_percent,
            )
        else:
            # No canonical items — return empty (exams must have items)
            raw_score = 0.0
            breakdown = GradingBreakdown(items=[], needs_manual_review=True, auto_graded=False)
        return GradingResult(
            auto_score=raw_score,
            breakdown=breakdown,
            needs_manual_review=breakdown.needs_manual_review,
        )


@GraderRegistry.register(AssessmentType.CODE_CHALLENGE)
class CodeChallengeGrader(BaseGrader):
    @override
    def grade(self, ctx: GradingContext) -> GradingResult:
        if ctx.items:
            auto_score, breakdown = grade_canonical_code_item(
                items=ctx.items,
                answers_by_item_uuid=ctx.answers_by_item_uuid,
                strategy=ctx.code_strategy,
            )
        else:
            auto_score, breakdown = grade_code_challenge(
                run_results=[],
                strategy=ctx.code_strategy,
            )
        return GradingResult(
            auto_score=auto_score,
            breakdown=breakdown,
            needs_manual_review=breakdown.needs_manual_review,
        )


class ManualReviewGrader(BaseGrader):
    @override
    def grade(self, ctx: GradingContext) -> GradingResult:
        if ctx.items:
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
                        user_answer=as_json_value(
                            ctx.answers_by_item_uuid.get(item.item_uuid),
                            field=f"answer:{item.item_uuid}",
                        ),
                    )
                    for item in ctx.items
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
