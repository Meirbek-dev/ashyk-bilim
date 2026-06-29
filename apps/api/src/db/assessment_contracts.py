"""Canonical assessment API contracts shared by activity and assessment DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from src.db.grading.progress import (
    AssessmentCompletionRule,
    AssessmentGradingMode,
    GradeReleaseMode,
    LatePolicy,
    LatePolicyNone,
)
from src.db.strict_base_model import PydanticStrictBaseModel

type AssessmentReviewVisibility = Literal["NONE", "SCORE_ONLY", "FULL"]


class AssessmentIntegrityPolicy(PydanticStrictBaseModel):
    copy_paste_protection: bool = False
    tab_switch_detection: bool = False
    devtools_detection: bool = False
    right_click_disabled: bool = False
    fullscreen_required: bool = False
    violation_threshold: int | None = None


class AssessmentDeliveryPolicy(PydanticStrictBaseModel):
    randomize_questions: bool = False
    randomize_options: bool = False
    partial_credit: bool = False
    negative_marking_percent: float = 0.0


class AssessmentCanonicalPolicy(PydanticStrictBaseModel):
    """Single typed policy contract consumed by authoring and attempt surfaces."""

    max_attempts: int | None = None
    time_limit_seconds: int | None = None
    due_at: datetime | None = None
    allow_late: bool = True
    late_policy: LatePolicy = Field(default_factory=LatePolicyNone)
    grade_release_mode: GradeReleaseMode = GradeReleaseMode.IMMEDIATE
    grading_mode: AssessmentGradingMode = AssessmentGradingMode.AUTO
    completion_rule: AssessmentCompletionRule = AssessmentCompletionRule.GRADED
    passing_score: float = 60.0
    required: bool = False
    review_visibility: AssessmentReviewVisibility = "FULL"
    integrity: AssessmentIntegrityPolicy = Field(default_factory=AssessmentIntegrityPolicy)
    delivery: AssessmentDeliveryPolicy = Field(default_factory=AssessmentDeliveryPolicy)

    @field_validator("late_policy", mode="before")
    @classmethod
    def _default_late_policy(cls, value: object) -> object:
        return LatePolicyNone() if value == {} else value

    @field_validator("grade_release_mode", mode="before")
    @classmethod
    def validate_grade_release_mode(cls, value: object) -> object:
        return GradeReleaseMode(value) if isinstance(value, str) else value

    @field_validator("grading_mode", mode="before")
    @classmethod
    def validate_grading_mode(cls, value: object) -> object:
        return AssessmentGradingMode(value) if isinstance(value, str) else value

    @field_validator("completion_rule", mode="before")
    @classmethod
    def validate_completion_rule(cls, value: object) -> object:
        return AssessmentCompletionRule(value) if isinstance(value, str) else value
