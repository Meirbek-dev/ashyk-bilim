"""Unified Submission model for all assessment types."""

from datetime import UTC, datetime
from enum import StrEnum
from typing import ClassVar, Self

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
from src.types import JsonObject, JsonValue

# ── Submission metadata sub-shapes ────────────────────────────────────────────


def _coerce_json_datetime(value: object) -> object:
    if isinstance(value, str):
        return datetime.fromisoformat(value)
    return value


class CodeRunRecord(PydanticStrictBaseModel):
    """Result of a single Judge0 run (non-finalising)."""

    run_id: str
    language_id: int
    status: str = ""
    passed: int = 0
    total: int = 0
    score: float | None = None
    stdout: str | None = None
    stderr: str | None = None
    compile_output: str | None = None
    time: float | None = None
    memory: int | None = None
    details: list[JsonObject] = Field(default_factory=list)
    created_at: datetime | None = None

    @field_validator("created_at", mode="before")
    @classmethod
    def validate_created_at(cls, value: object) -> object:
        return _coerce_json_datetime(value)


class AntiCheatViolation(PydanticStrictBaseModel):
    """A single anti-cheat event logged during an attempt."""

    kind: str  # e.g. "TAB_SWITCH", "COPY_PASTE", "FULLSCREEN_EXIT"
    occurred_at: datetime
    count: int = 1

    @field_validator("occurred_at", mode="before")
    @classmethod
    def validate_occurred_at(cls, value: object) -> object:
        return _coerce_json_datetime(value)


class PlagiarismScore(PydanticStrictBaseModel):
    """Plagiarism detection result for a CODE submission."""

    score: float  # 0–1 similarity score
    checked_at: datetime
    flagged: bool = False
    details: JsonObject = Field(default_factory=dict)

    @field_validator("checked_at", mode="before")
    @classmethod
    def validate_checked_at(cls, value: object) -> object:
        return _coerce_json_datetime(value)


class SubmissionMetadata(PydanticStrictBaseModel):
    """Typed sub-shapes carved out of Submission.metadata_json."""

    model_config = ConfigDict(extra="forbid")

    # Latest visible-test run result (overwritten on each Run click; never finalised)
    latest_run: CodeRunRecord | None = None
    # Full run history (append-only; populated on Submit for CODE kind)
    runs: list[CodeRunRecord] = Field(default_factory=list)
    # Anti-cheat events logged during the attempt
    violations: list[AntiCheatViolation] = Field(default_factory=list)
    # Quiz/runtime metadata that needs to round-trip for idempotency and diagnostics
    attempt_uuid: str | None = None
    idempotency_key: str | None = None
    duration_seconds: int | None = None
    violation_count: int = 0
    # Auto-submit diagnostics
    auto_submit_reason: str | None = None
    auto_submitted_at: str | None = None
    # Plagiarism detection outcome (populated post-submit by background task)
    plagiarism: PlagiarismScore | None = None
    plagiarism_status: str | None = None
    plagiarism_error: str | None = None


def normalize_submission_metadata(value: object) -> JsonObject:
    """Validate typed metadata sub-shapes while preserving unrecognized keys."""
    if isinstance(value, SubmissionMetadata):
        return value.model_dump(mode="json", exclude_none=True)
    if isinstance(value, dict):
        return SubmissionMetadata.model_validate(value).model_dump(
            mode="json",
            exclude_none=True,
        )
    return SubmissionMetadata().model_dump(mode="json", exclude_none=True)


def merge_submission_metadata(
    existing: object,
    **updates: object,
) -> JsonObject:
    merged = {
        **normalize_submission_metadata(existing),
        **{key: value for key, value in updates.items() if value is not None},
    }
    return normalize_submission_metadata(merged)


class SubmissionStatus(StrEnum):
    DRAFT = "DRAFT"  # student is working, not yet submitted
    PENDING = "PENDING"  # submitted, awaiting teacher grading
    GRADED = "GRADED"  # teacher (or auto-grader) set final_score
    PUBLISHED = "PUBLISHED"  # grade is finalised and visible to the student
    RETURNED = "RETURNED"  # teacher sent it back for revision


class AssessmentType(StrEnum):
    QUIZ = "QUIZ"
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
    user_answer: JsonValue = None
    correct_answer: JsonValue = None


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
            if isinstance(v, (int, float, str, bytes)):
                val = float(v)
            else:
                msg = f"Cannot coerce {type(v)} to float"
                raise TypeError(msg)
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
        description="Итоговый балл 0–100",
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

    # Penalty percentage snapshotted at submit time from the canonical late policy.
    # 0.0 = no penalty. final_score = raw * (1 - pct/100).
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
    answers_json: JsonObject = SQLField(default_factory=dict)
    raw_grading_json: GradingBreakdown = SQLField(default_factory=GradingBreakdown)
    grading_json: GradingBreakdown = SQLField(default_factory=GradingBreakdown)
    metadata_json: JsonObject = SQLField(default_factory=dict)
    late_penalty_pct: float = 0.0
    late_penalty_reason: str | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    graded_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    grading_version: int = 1
    version: int = 1  # optimistic lock counter — include in If-Match header
    draft_version: int = 1  # student draft concurrency lock counter

    # Populated by the teacher list endpoint; None for student-facing endpoints
    user: SubmissionUser | None = None

    @model_validator(mode="after")
    def populate_late_penalty_reason(self) -> Self:
        if self.is_late and self.late_penalty_pct > 0 and not self.late_penalty_reason:
            self.late_penalty_reason = f"Late submission penalty applied: {self.late_penalty_pct:g}%"
        return self

    @field_validator("raw_grading_json", "grading_json", mode="before")
    @classmethod
    def coerce_grading_breakdown(cls, v: object) -> object:
        """Coerce a raw dict from the DB into a GradingBreakdown model."""
        if isinstance(v, dict):
            return GradingBreakdown(**v) if v else GradingBreakdown()
        return v

    @field_validator("metadata_json", mode="before")
    @classmethod
    def coerce_metadata_json(cls, value: object) -> object:
        return normalize_submission_metadata(value)


class SubmissionUpdate(SQLModelStrictBaseModel):
    """Partial update model for a submission (teacher grading)."""

    final_score: float | None = None
    status: SubmissionStatus | None = None
    raw_grading_json: JsonObject | None = None
    grading_json: JsonObject | None = None
    graded_at: datetime | None = None

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: object) -> object:
        if v is not None and isinstance(v, str):
            return SubmissionStatus(v)
        return v


class Submission(SubmissionBase, table=True):  # type: ignore[misc]
    """Single unified row per student per assessment attempt."""

    __tablename__: ClassVar[str] = "submission"
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

    activity_id: int = SQLField(sa_column=Column("activity_id", ForeignKey("activity.id", ondelete="CASCADE")))
    assessment_policy_id: int | None = SQLField(
        default=None,
        sa_column=Column(
            "assessment_policy_id",
            ForeignKey("assessment_policy.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    user_id: int = SQLField(sa_column=Column("user_id", ForeignKey("user.id", ondelete="CASCADE")))

    # Typed payload — validated by Pydantic schemas before saving
    answers_json: JsonObject = SQLField(
        default_factory=dict,
        sa_column=Column(JSON),
    )
    grading_json: JsonObject = SQLField(
        default_factory=dict,
        sa_column=Column(JSON),
    )
    raw_grading_json: JsonObject = SQLField(
        default_factory=dict,
        sa_column=Column("raw_grading_json", JSON, nullable=False, server_default="{}"),
    )
    metadata_json: JsonObject = SQLField(
        default_factory=dict,
        sa_column=Column(JSON),
    )

    # Late flag — set when submitted after due_date
    is_late: bool = SQLField(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
    )

    # Штраф, применённый к итоговому баллу этой отправки (0–100, зафиксирован при отправке).
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
        sa_column=Column("grading_version", Integer, nullable=False, server_default="1"),
    )

    # Optimistic concurrency lock — incremented on every teacher grade write.
    # Teachers pass this as the If-Match header value; a mismatch → 412.
    version: int = SQLField(
        default=1,
        sa_column=Column("version", Integer, nullable=False, server_default="1"),
    )

    # Student draft concurrency — incremented on every draft save.
    # Separate from teacher `version` to avoid conflicts between student saves
    # and teacher grading on the same row.
    draft_version: int = SQLField(
        default=1,
        sa_column=Column("draft_version", Integer, nullable=False, server_default="1"),
    )

    # Phase 3: Versioning — snapshot at submit time
    content_version: int = SQLField(
        default=1,
        sa_column=Column("content_version", Integer, nullable=False, server_default="1"),
    )
    policy_version: int = SQLField(
        default=1,
        sa_column=Column("policy_version", Integer, nullable=False, server_default="1"),
    )
    items_snapshot: JsonObject | None = SQLField(
        default_factory=None,
        sa_column=Column("items_snapshot", JSON, nullable=True),
    )
    policy_snapshot: JsonObject | None = SQLField(
        default_factory=None,
        sa_column=Column("policy_snapshot", JSON, nullable=True),
    )

    @field_validator("metadata_json", mode="before")
    @classmethod
    def validate_metadata_json(cls, value: object) -> object:
        return normalize_submission_metadata(value)


# ── Paginated response ────────────────────────────────────────────────────────


class SubmissionListResponse(SQLModelStrictBaseModel):
    """Typed paginated response for the teacher submissions list."""

    items: list[SubmissionRead]
    total: int
    page: int
    page_size: int
    pages: int


# ── Aggregate stats ───────────────────────────────────────────────────────────


class ScoreDistributionBucket(SQLModelStrictBaseModel):
    """One 10-point score bucket for the distribution histogram."""

    range: str  # e.g. "0–10"
    count: int


class SubmissionStats(SQLModelStrictBaseModel):
    """Aggregate statistics for the teacher dashboard header."""

    total: int
    graded_count: int
    needs_grading_count: int  # count of PENDING submissions
    late_count: int  # count of PENDING submissions where is_late=True
    avg_score: float | None
    pass_rate: float | None  # percentage of GRADED/PUBLISHED scoring ≥ 50
    score_distribution: list[ScoreDistributionBucket] = Field(default_factory=list)


class ItemAnalytics(SQLModelStrictBaseModel):
    """Per-question analytics row for the teacher Results tab."""

    item_uuid: str
    title: str
    kind: str
    max_score: float
    response_count: int  # number of graded submissions that include this item
    avg_score_pct: float | None  # average (item.score / item.max_score) * 100
    correct_pct: float | None  # percentage of responses where correct == True
    discrimination_index: float | None  # classic item discrimination (top27 − bottom27) / n
