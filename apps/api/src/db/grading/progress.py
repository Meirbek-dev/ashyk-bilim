"""Canonical assessment policy and learner progress models."""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import ConfigDict, field_validator
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlmodel import Field

from src.db.grading.submissions import AssessmentType
from src.db.strict_base_model import SQLModelStrictBaseModel


class AssessmentGradingMode(StrEnum):
    AUTO = "AUTO"
    MANUAL = "MANUAL"
    AUTO_THEN_MANUAL = "AUTO_THEN_MANUAL"


class GradeReleaseMode(StrEnum):
    """Controls when a published grade becomes visible to the student.

    IMMEDIATE — grade is visible as soon as the teacher marks it PUBLISHED.
    BATCH     — grade is hidden until a teacher explicitly runs
                POST /grading/activities/{uuid}/publish-grades, which stamps
                GradingEntry.published_at for all PUBLISHED submissions at once.
    """
    IMMEDIATE = "IMMEDIATE"
    BATCH = "BATCH"


class AssessmentCompletionRule(StrEnum):
    VIEWED = "VIEWED"
    SUBMITTED = "SUBMITTED"
    GRADED = "GRADED"
    PASSED = "PASSED"
    TEACHER_VERIFIED = "TEACHER_VERIFIED"


class ActivityProgressState(StrEnum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    NEEDS_GRADING = "NEEDS_GRADING"
    RETURNED = "RETURNED"
    GRADED = "GRADED"
    PASSED = "PASSED"
    FAILED = "FAILED"
    COMPLETED = "COMPLETED"


class AssessmentPolicy(SQLModelStrictBaseModel, table=True):
    """Operational policy for a gradeable course activity."""

    __tablename__ = "assessment_policy"
    __table_args__ = (
        UniqueConstraint("activity_id", name="uq_assessment_policy_activity_id"),
        UniqueConstraint("policy_uuid", name="uq_assessment_policy_uuid"),
        Index("ix_assessment_policy_activity_id", "activity_id"),
        Index("ix_assessment_policy_assessment_type", "assessment_type"),
    )

    model_config = ConfigDict(use_enum_values=True)

    id: int | None = Field(default=None, primary_key=True)
    policy_uuid: str
    activity_id: int = Field(
        sa_column=Column(
            "activity_id",
            ForeignKey("activity.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    assessment_type: AssessmentType = Field(
        sa_column=Column("assessment_type", String, nullable=False)
    )
    grading_mode: AssessmentGradingMode = Field(
        default=AssessmentGradingMode.MANUAL,
        sa_column=Column("grading_mode", String, nullable=False),
    )
    grade_release_mode: GradeReleaseMode = Field(
        default=GradeReleaseMode.IMMEDIATE,
        sa_column=Column(
            "grade_release_mode",
            String,
            nullable=False,
            server_default=GradeReleaseMode.IMMEDIATE,
        ),
    )
    completion_rule: AssessmentCompletionRule = Field(
        default=AssessmentCompletionRule.GRADED,
        sa_column=Column("completion_rule", String, nullable=False),
    )
    passing_score: float = Field(default=60.0, sa_column=Column(Float, nullable=False))
    max_attempts: int | None = Field(default=None)
    time_limit_seconds: int | None = Field(default=None)
    due_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    allow_late: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default="true"),
    )
    late_policy_json: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    settings_json: dict = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            nullable=False,
        ),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
        ),
    )

    @field_validator("assessment_type", mode="before")
    @classmethod
    def validate_assessment_type(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentType(value)
        return value

    @field_validator("grading_mode", mode="before")
    @classmethod
    def validate_grading_mode(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentGradingMode(value)
        return value

    @field_validator("grade_release_mode", mode="before")
    @classmethod
    def validate_grade_release_mode(cls, value: object) -> object:
        if isinstance(value, str):
            return GradeReleaseMode(value)
        return value

    @field_validator("completion_rule", mode="before")
    @classmethod
    def validate_completion_rule(cls, value: object) -> object:
        if isinstance(value, str):
            return AssessmentCompletionRule(value)
        return value


class ActivityProgress(SQLModelStrictBaseModel, table=True):
    """Canonical current state for one learner on one course activity."""

    __tablename__ = "activity_progress"
    __table_args__ = (
        UniqueConstraint("activity_id", "user_id", name="uq_activity_progress_user"),
        Index("ix_activity_progress_course_user", "course_id", "user_id"),
        Index("ix_activity_progress_activity_state", "activity_id", "state"),
        Index(
            "ix_activity_progress_course_teacher_action",
            "course_id",
            "teacher_action_required",
        ),
    )

    model_config = ConfigDict(use_enum_values=True)

    id: int | None = Field(default=None, primary_key=True)
    course_id: int = Field(
        sa_column=Column(
            "course_id",
            ForeignKey("course.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    activity_id: int = Field(
        sa_column=Column(
            "activity_id",
            ForeignKey("activity.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    user_id: int = Field(
        sa_column=Column(
            "user_id",
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    state: ActivityProgressState = Field(
        default=ActivityProgressState.NOT_STARTED,
        sa_column=Column("state", String, nullable=False),
    )
    required: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default="true"),
    )
    score: float | None = None
    passed: bool | None = None
    best_submission_id: int | None = Field(
        default=None,
        sa_column=Column(
            "best_submission_id",
            ForeignKey("submission.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    latest_submission_id: int | None = Field(
        default=None,
        sa_column=Column(
            "latest_submission_id",
            ForeignKey("submission.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    attempt_count: int = Field(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default="0"),
    )
    started_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    last_activity_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    submitted_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    graded_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    completed_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    due_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    is_late: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
    )
    teacher_action_required: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
    )
    status_reason: str | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            nullable=False,
        ),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
        ),
    )

    @field_validator("state", mode="before")
    @classmethod
    def validate_state(cls, value: object) -> object:
        if isinstance(value, str):
            return ActivityProgressState(value)
        return value


class CourseProgress(SQLModelStrictBaseModel, table=True):
    """Aggregate current state for one learner in one course."""

    __tablename__ = "course_progress"
    __table_args__ = (
        UniqueConstraint("course_id", "user_id", name="uq_course_progress_user"),
        Index("ix_course_progress_course_user", "course_id", "user_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    course_id: int = Field(
        sa_column=Column(
            "course_id",
            ForeignKey("course.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    user_id: int = Field(
        sa_column=Column(
            "user_id",
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    completed_required_count: int = Field(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default="0"),
    )
    total_required_count: int = Field(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default="0"),
    )
    progress_pct: float = Field(
        default=0.0,
        sa_column=Column(Float, nullable=False, server_default="0"),
    )
    grade_average: float | None = None
    # Weighted average using Assignment.weight.  NULL when no graded scores exist.
    weighted_grade_average: float | None = Field(
        default=None,
        sa_column=Column("weighted_grade_average", Float, nullable=True),
    )
    missing_required_count: int = Field(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default="0"),
    )
    needs_grading_count: int = Field(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default="0"),
    )
    last_activity_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    completed_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    certificate_eligible: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            nullable=False,
        ),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
        ),
    )
