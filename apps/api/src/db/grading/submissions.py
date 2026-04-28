"""
Unified Submission model for all assessment types.
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Self

from pydantic import ConfigDict, Field, field_validator, model_validator
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
)
from sqlmodel import Field as SQLField

from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel


class SubmissionStatus(StrEnum):
    DRAFT = "DRAFT"  # student is working, not yet submitted
    PENDING = "PENDING"  # submitted, awaiting teacher grading
    GRADED = "GRADED"  # teacher (or auto-grader) set final_score
    PUBLISHED = "PUBLISHED"  # grade is finalised and visible to the student
    RETURNED = "RETURNED"  # teacher sent it back for revision


class AssessmentType(StrEnum):
    QUIZ = "QUIZ"
    ASSIGNMENT = "ASSIGNMENT"
    EXAM = "EXAM"
    CODE_CHALLENGE = "CODE_CHALLENGE"


class GradedItem(SQLModelStrictBaseModel):
    """Per-question or per-task grading detail."""

    item_id: str
    item_text: str = ""
    score: float = 0.0
    max_score: float = 0.0
    correct: bool | None = None  # None for non-auto-gradeable items
    feedback: str = ""
    needs_manual_review: bool = False
    user_answer: Any = None
    correct_answer: Any = None


class GradingBreakdown(SQLModelStrictBaseModel):
    """Complete grading result for a submission."""

    items: list[GradedItem] = SQLField(default_factory=list)
    needs_manual_review: bool = False  # true if any open-text items present
    auto_graded: bool = False
    feedback: str = ""  # Overall teacher feedback comment


# ── Teacher grading input ─────────────────────────────────────────────────────


class ItemFeedback(PydanticStrictBaseModel):
    """Optional per-item feedback from the teacher."""

    item_id: str
    score: float | None = None
    feedback: str = ""

    @field_validator("score", mode="before")
    @classmethod
    def validate_score(cls, v: object) -> object:
        if v is not None:
            val = float(v)
            if val < 0 or val > 100:
                msg = f"Score {val} is out of range (0–100)"
                raise ValueError(msg)
        return v


class TeacherGradeInput(PydanticStrictBaseModel):
    """Body for PATCH /grading/submissions/{submission_uuid}."""

    final_score: float = Field(
        ...,
        ge=0,
        le=100,
        description="Final score 0–100",
    )
    item_feedback: list[ItemFeedback] = Field(
        default_factory=list,
        description="Optional per-question/per-task comments",
    )
    # GRADED = save grade (visible to teacher only)
    # PUBLISHED = publish grade (visible to student)
    # RETURNED = send back for revision
    status: str = "GRADED"
    feedback: str = ""


# ── Submission base + table ───────────────────────────────────────────────────


class SubmissionBase(SQLModelStrictBaseModel):
    model_config = ConfigDict(use_enum_values=True)

    # What was submitted
    assessment_type: AssessmentType
    activity_id: int

    # Who submitted
    user_id: int

    # Scores — always 0–100 percentage
    auto_score: float | None = None  # set by auto-grader
    final_score: float | None = None  # teacher override (or auto_score copy)

    # Workflow
    status: SubmissionStatus = SubmissionStatus.DRAFT
    attempt_number: int = 1

    # Late flag — set when submitted after due_date, independent of status
    is_late: bool = False

    # Penalty percentage snapshotted at submit time from the AssessmentPolicy's
    # late_policy_json.  0.0 = no penalty.  final_score = raw * (1 - pct/100).
    late_penalty_pct: float = 0.0

    @field_validator("assessment_type", mode="before")
    @classmethod
    def validate_assessment_type(cls, v: object) -> object:
        if isinstance(v, str):
            return AssessmentType(v)
        return v

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: object) -> object:
        if isinstance(v, str):
            return SubmissionStatus(v)
        return v


class SubmissionCreate(SubmissionBase):
    """Input model for creating a new submission."""


class SubmissionUser(SQLModelStrictBaseModel):
    """Public user info embedded in teacher-view submissions."""

    id: int
    username: str
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    email: str
    avatar_image: str | None = None
    user_uuid: str | None = None


class SubmissionRead(SubmissionBase):
    """Output model for reading a submission."""

    id: int
    submission_uuid: str
    answers_json: dict = SQLField(default_factory=dict)
    grading_json: GradingBreakdown = SQLField(default_factory=GradingBreakdown)
    late_penalty_pct: float = 0.0
    late_penalty_reason: str | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    graded_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    grading_version: int = 1
    version: int = 1  # optimistic lock counter — include in If-Match header

    # Populated by the teacher list endpoint; None for student-facing endpoints
    user: SubmissionUser | None = None

    @model_validator(mode="after")
    def populate_late_penalty_reason(self) -> Self:
        if self.is_late and self.late_penalty_pct > 0 and not self.late_penalty_reason:
            self.late_penalty_reason = (
                f"Late submission penalty applied: {self.late_penalty_pct:g}%"
            )
        return self

    @field_validator("grading_json", mode="before")
    @classmethod
    def coerce_grading_json(cls, v: object) -> object:
        """Coerce a raw dict from the DB into a GradingBreakdown model."""
        if isinstance(v, dict):
            return GradingBreakdown(**v) if v else GradingBreakdown()
        return v


class SubmissionUpdate(SQLModelStrictBaseModel):
    """Partial update model for a submission (teacher grading)."""

    model_config = ConfigDict(use_enum_values=True)

    final_score: float | None = None
    status: SubmissionStatus | None = None
    grading_json: dict | None = None
    graded_at: datetime | None = None

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: object) -> object:
        if v is not None and isinstance(v, str):
            return SubmissionStatus(v)
        return v


class Submission(SubmissionBase, table=True):
    """Single unified row per student per assessment attempt."""

    __tablename__ = "submission"
    __table_args__ = (
        Index("ix_submission_user_activity", "user_id", "activity_id"),
        Index("ix_submission_uuid", "submission_uuid", unique=True),
        Index(
            "idx_submission_activity_status_submitted",
            "activity_id",
            "status",
            "submitted_at",
        ),
        Index(
            "idx_submission_activity_status_late",
            "activity_id",
            "status",
            "is_late",
        ),
        Index(
            "idx_submission_activity_user_status",
            "activity_id",
            "user_id",
            "status",
        ),
        Index(
            "idx_submission_policy_user_attempt",
            "assessment_policy_id",
            "user_id",
            "attempt_number",
        ),
    )

    id: int | None = SQLField(default=None, primary_key=True)
    submission_uuid: str = SQLField(index=True)

    # Explicitly store enum fields as VARCHAR
    assessment_type: AssessmentType = SQLField(
        sa_column=Column("assessment_type", String, nullable=False),
    )
    status: SubmissionStatus = SQLField(
        default=SubmissionStatus.DRAFT,
        sa_column=Column("status", String, nullable=False, server_default="DRAFT"),
    )

    activity_id: int = SQLField(
        sa_column=Column("activity_id", ForeignKey("activity.id", ondelete="CASCADE"))
    )
    assessment_policy_id: int | None = SQLField(
        default=None,
        sa_column=Column(
            "assessment_policy_id",
            ForeignKey("assessment_policy.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    user_id: int = SQLField(
        sa_column=Column("user_id", ForeignKey("user.id", ondelete="CASCADE"))
    )

    # Typed payload — validated by Pydantic schemas before saving
    answers_json: dict = SQLField(
        default_factory=dict,
        sa_column=Column(JSON),
    )
    grading_json: dict = SQLField(
        default_factory=dict,
        sa_column=Column(JSON),
    )

    # Late flag — set when submitted after due_date
    is_late: bool = SQLField(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
    )

    # Penalty applied to this submission's final score (0–100, snapshotted at submit).
    late_penalty_pct: float = SQLField(
        default=0.0,
        sa_column=Column(
            "late_penalty_pct",
            Float,
            nullable=False,
            server_default="0",
        ),
    )

    # Server-only start timestamp (B2: prevents client falsification)
    started_at: datetime | None = SQLField(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    submitted_at: datetime | None = SQLField(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    graded_at: datetime | None = SQLField(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True)),
    )
    updated_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True)),
    )
    # Schema version for safe JSON evolution
    grading_version: int = SQLField(
        default=1,
        sa_column=Column(
            "grading_version", Integer, nullable=False, server_default="1"
        ),
    )

    # Optimistic concurrency lock — incremented on every teacher grade write.
    # Teachers pass this as the If-Match header value; a mismatch → 412.
    version: int = SQLField(
        default=1,
        sa_column=Column(
            "version", Integer, nullable=False, server_default="1"
        ),
    )


# ── Paginated response ────────────────────────────────────────────────────────


class SubmissionListResponse(SQLModelStrictBaseModel):
    """Typed paginated response for the teacher submissions list."""

    items: list[SubmissionRead]
    total: int
    page: int
    page_size: int
    pages: int


# ── Aggregate stats ───────────────────────────────────────────────────────────


class SubmissionStats(SQLModelStrictBaseModel):
    """Aggregate statistics for the teacher dashboard header."""

    total: int
    graded_count: int
    needs_grading_count: int  # count of PENDING submissions
    late_count: int  # count of PENDING submissions where is_late=True
    avg_score: float | None
    pass_rate: float | None  # percentage of GRADED/PUBLISHED scoring ≥ 50
