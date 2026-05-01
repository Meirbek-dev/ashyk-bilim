from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import ConfigDict, field_validator, model_validator
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
)
from sqlmodel import Field

from src.db.grading.submissions import SubmissionRead
from src.db.strict_base_model import SQLModelStrictBaseModel


def _validate_max_grade_value(value: int | None) -> int | None:
    if value is None:
        return None
    if not 0 <= value <= 100:
        raise ValueError("max_grade_value must be between 0 and 100")
    return value


# ── Enums ──────────────────────────────────────────────────────────────────────


class AssignmentStatus(StrEnum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class GradingTypeEnum(StrEnum):
    NUMERIC = "NUMERIC"
    PERCENTAGE = "PERCENTAGE"


class AssignmentTaskTypeEnum(StrEnum):
    FILE_SUBMISSION = "FILE_SUBMISSION"
    QUIZ = "QUIZ"
    FORM = "FORM"
    OTHER = "OTHER"


# ── Task config types ──────────────────────────────────────────────────────────


class AssignmentFileTaskConfig(SQLModelStrictBaseModel):
    kind: Literal["FILE_SUBMISSION"] = "FILE_SUBMISSION"
    allowed_mime_types: list[str] = Field(default_factory=list)
    max_file_size_mb: int | None = None
    max_files: int = 1


class AssignmentQuizOptionConfig(SQLModelStrictBaseModel):
    optionUUID: str
    text: str = ""
    fileID: str = ""
    type: Literal["text", "image", "audio", "video"] = "text"
    assigned_right_answer: bool = False


class AssignmentQuizQuestionConfig(SQLModelStrictBaseModel):
    questionUUID: str
    questionText: str = ""
    options: list[AssignmentQuizOptionConfig] = Field(default_factory=list)


class AssignmentQuizTaskSettings(SQLModelStrictBaseModel):
    max_attempts: int | None = None
    time_limit_seconds: int | None = None
    max_score_penalty_per_attempt: float | None = None


class AssignmentQuizTaskConfig(SQLModelStrictBaseModel):
    kind: Literal["QUIZ"] = "QUIZ"
    questions: list[AssignmentQuizQuestionConfig] = Field(default_factory=list)
    settings: AssignmentQuizTaskSettings = Field(
        default_factory=AssignmentQuizTaskSettings
    )


class AssignmentFormBlankConfig(SQLModelStrictBaseModel):
    blankUUID: str
    placeholder: str = ""
    correctAnswer: str = ""
    hint: str = ""


class AssignmentFormQuestionConfig(SQLModelStrictBaseModel):
    questionUUID: str
    questionText: str = ""
    blanks: list[AssignmentFormBlankConfig] = Field(default_factory=list)


class AssignmentFormTaskConfig(SQLModelStrictBaseModel):
    kind: Literal["FORM"] = "FORM"
    questions: list[AssignmentFormQuestionConfig] = Field(default_factory=list)


class AssignmentOtherTaskConfig(SQLModelStrictBaseModel):
    kind: Literal["OTHER"] = "OTHER"
    body: dict[str, object] = Field(default_factory=dict)


AssignmentTaskConfig = (
    AssignmentFileTaskConfig
    | AssignmentQuizTaskConfig
    | AssignmentFormTaskConfig
    | AssignmentOtherTaskConfig
)

_TASK_TYPE_TO_CONFIG: dict[str, type[SQLModelStrictBaseModel]] = {
    "FILE_SUBMISSION": AssignmentFileTaskConfig,
    "QUIZ": AssignmentQuizTaskConfig,
    "FORM": AssignmentFormTaskConfig,
    "OTHER": AssignmentOtherTaskConfig,
}


# ── Assignment DB model ────────────────────────────────────────────────────────


class Assignment(SQLModelStrictBaseModel, table=True):
    """Assignment DB row — FK columns stay internal, not exposed via the API."""

    __tablename__ = "assignment"
    __table_args__ = (
        UniqueConstraint("activity_id", name="uq_assignment_activity_id"),
        Index("idx_assignment_activity_id", "activity_id"),
        Index("idx_assignment_status", "status"),
        Index("idx_assignment_scheduled_publish_at", "scheduled_publish_at"),
    )

    model_config = ConfigDict(use_enum_values=True)

    id: int | None = Field(default=None, primary_key=True)
    assignment_uuid: str
    title: str
    description: str
    due_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    # Lifecycle status — replaces the legacy `published` boolean.
    # Keep published col in DB for backward compat; dropped in Phase 7 cleanup.
    published: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False, server_default="false"),
    )
    status: AssignmentStatus = Field(
        default=AssignmentStatus.DRAFT,
        sa_column=Column("status", String, nullable=False, server_default="DRAFT"),
    )
    scheduled_publish_at: datetime | None = Field(
        default=None,
        sa_column=Column(
            "scheduled_publish_at", DateTime(timezone=True), nullable=True
        ),
    )
    published_at: datetime | None = Field(
        default=None,
        sa_column=Column("published_at", DateTime(timezone=True), nullable=True),
    )
    archived_at: datetime | None = Field(
        default=None,
        sa_column=Column("archived_at", DateTime(timezone=True), nullable=True),
    )
    # Relative weight of this assignment in the course grade calculation.
    # Default 1.0 = equal weight.  Values above 1.0 make this assignment count
    # more; 0.0 makes it optional (not included in weighted_grade_average).
    weight: float = Field(
        default=1.0,
        sa_column=Column("weight", Float, nullable=False, server_default="1.0"),
    )
    grading_type: GradingTypeEnum = Field(
        sa_column=Column("grading_type", String, nullable=False)
    )
    course_id: int = Field(
        sa_column=Column("course_id", ForeignKey("course.id", ondelete="CASCADE"))
    )
    chapter_id: int = Field(
        sa_column=Column("chapter_id", ForeignKey("chapter.id", ondelete="CASCADE"))
    )
    activity_id: int = Field(
        sa_column=Column("activity_id", ForeignKey("activity.id", ondelete="CASCADE"))
    )
    created_at: datetime = Field(
        sa_column=Column("created_at", DateTime(timezone=True), nullable=False)
    )
    updated_at: datetime = Field(
        sa_column=Column("updated_at", DateTime(timezone=True), nullable=False)
    )


# ── Assignment API schemas ─────────────────────────────────────────────────────


class AssignmentRead(SQLModelStrictBaseModel):
    """Projection returned by the API — never exposes internal FK integer IDs."""

    model_config = ConfigDict(use_enum_values=True)

    assignment_uuid: str
    title: str
    description: str
    due_at: datetime | None = None
    # Legacy field: kept for backward compat — use `status` for lifecycle logic.
    published: bool
    status: AssignmentStatus
    scheduled_publish_at: datetime | None = None
    published_at: datetime | None = None
    archived_at: datetime | None = None
    weight: float = 1.0
    grading_type: GradingTypeEnum
    course_uuid: str | None = None
    activity_uuid: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AssignmentPublishInput(SQLModelStrictBaseModel):
    """Input for POST /assignments/{uuid}/publish."""

    scheduled_at: datetime | None = None  # None = publish immediately


class AssignmentCreateWithActivity(SQLModelStrictBaseModel):
    """Input for POST /assignments/with-activity."""

    model_config = ConfigDict(use_enum_values=True)

    title: str
    description: str
    due_at: datetime | None = None
    status: AssignmentStatus = AssignmentStatus.DRAFT
    grading_type: GradingTypeEnum
    course_id: int
    chapter_id: int

    @field_validator("grading_type", mode="before")
    @classmethod
    def validate_grading_type(cls, v: object) -> object:
        if isinstance(v, str):
            return GradingTypeEnum(v)
        return v

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: object) -> object:
        if isinstance(v, str):
            return AssignmentStatus(v)
        return v


class AssignmentUpdate(SQLModelStrictBaseModel):
    """Partial update — only the fields a teacher can change after creation.

    Lifecycle transitions (publish, archive) use dedicated endpoints;
    ``status`` is intentionally absent from this schema.
    """

    model_config = ConfigDict(use_enum_values=True)

    title: str | None = None
    description: str | None = None
    due_at: datetime | None = None
    grading_type: GradingTypeEnum | None = None

    @field_validator("grading_type", mode="before")
    @classmethod
    def validate_grading_type(cls, v: object) -> object:
        if v is not None and isinstance(v, str):
            return GradingTypeEnum(v)
        return v


# ── AssignmentTask ─────────────────────────────────────────────────────────────


class AssignmentTaskBase(SQLModelStrictBaseModel):
    """Fields shared between the DB model and read schema."""

    model_config = ConfigDict(use_enum_values=True)

    title: str
    description: str
    hint: str
    reference_file: str | None = None
    assignment_type: AssignmentTaskTypeEnum
    max_grade_value: int = 0

    @field_validator("assignment_type", mode="before")
    @classmethod
    def validate_assignment_type(cls, v: object) -> object:
        if isinstance(v, str):
            return AssignmentTaskTypeEnum(v)
        return v

    @field_validator("max_grade_value")
    @classmethod
    def validate_max_grade_value(cls, v: int) -> int:
        validated = _validate_max_grade_value(v)
        return 0 if validated is None else validated


class AssignmentTaskCreate(AssignmentTaskBase):
    """Input for creating a new task — contents validated against task type."""

    contents: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def validate_contents_shape(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        task_type = str(data.get("assignment_type", "OTHER"))
        raw = data.get("contents")
        if isinstance(raw, dict) and raw:
            config_cls = _TASK_TYPE_TO_CONFIG.get(task_type, AssignmentOtherTaskConfig)
            config_cls.model_validate(raw)
        return data


class AssignmentTaskRead(AssignmentTaskBase):
    """Output model for reading an assignment task."""

    id: int
    assignment_task_uuid: str
    order: int = 0
    contents: dict[str, object] = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AssignmentTaskUpdate(SQLModelStrictBaseModel):
    """Partial update for an existing task.

    ``order`` is intentionally absent — use the dedicated reorder endpoint.
    ``contents`` is validated against ``assignment_type`` when both are present.
    """

    model_config = ConfigDict(use_enum_values=True)

    title: str | None = None
    description: str | None = None
    hint: str | None = None
    reference_file: str | None = None
    assignment_type: AssignmentTaskTypeEnum | None = None
    contents: dict[str, object] | None = None
    max_grade_value: int | None = None

    @field_validator("assignment_type", mode="before")
    @classmethod
    def validate_assignment_type(cls, v: object) -> object:
        if v is not None and isinstance(v, str):
            return AssignmentTaskTypeEnum(v)
        return v

    @field_validator("max_grade_value")
    @classmethod
    def validate_max_grade_value(cls, v: int | None) -> int | None:
        return _validate_max_grade_value(v)

    @model_validator(mode="before")
    @classmethod
    def validate_contents_shape(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        task_type = data.get("assignment_type")
        raw = data.get("contents")
        if task_type is not None and isinstance(raw, dict) and raw:
            config_cls = _TASK_TYPE_TO_CONFIG.get(
                str(task_type), AssignmentOtherTaskConfig
            )
            config_cls.model_validate(raw)
        return data


class AssignmentTask(AssignmentTaskBase, table=True):
    """Assignment task DB row."""

    __table_args__ = (
        UniqueConstraint("assignment_id", "order", name="uq_assignmenttask_order"),
        UniqueConstraint(
            "assignment_id",
            "assignment_task_uuid",
            name="uq_assignmenttask_assignment_uuid",
        ),
        Index("idx_assignmenttask_assignment_order", "assignment_id", "order"),
        Index("idx_assignmenttask_activity_id", "activity_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    assignment_task_uuid: str
    order: int = Field(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default="0"),
    )
    contents: dict[str, object] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
    )
    created_at: datetime = Field(
        sa_column=Column("created_at", DateTime(timezone=True), nullable=False)
    )
    updated_at: datetime = Field(
        sa_column=Column("updated_at", DateTime(timezone=True), nullable=False)
    )
    assignment_id: int = Field(
        sa_column=Column(
            "assignment_id", ForeignKey("assignment.id", ondelete="CASCADE")
        )
    )
    course_id: int = Field(
        sa_column=Column("course_id", ForeignKey("course.id", ondelete="CASCADE"))
    )
    chapter_id: int = Field(
        sa_column=Column("chapter_id", ForeignKey("chapter.id", ondelete="CASCADE"))
    )
    activity_id: int = Field(
        sa_column=Column("activity_id", ForeignKey("activity.id", ondelete="CASCADE"))
    )


# ── Draft / submission schemas ─────────────────────────────────────────────────


class AssignmentTaskAnswer(SQLModelStrictBaseModel):
    """Canonical assignment answer shape stored in Submission.answers_json."""

    task_uuid: str
    content_type: Literal["file", "text", "form", "quiz", "other"]
    file_key: str | None = None
    text_content: str | None = None
    form_data: dict[str, object] | None = None
    quiz_answers: dict[str, object] | None = None
    answer_metadata: dict[str, object] = Field(default_factory=dict)


class AssignmentDraftPatch(SQLModelStrictBaseModel):
    """Patch/upsert payload for the current user's assignment draft."""

    tasks: list[AssignmentTaskAnswer] = Field(default_factory=list)


class AssignmentDraftRead(SQLModelStrictBaseModel):
    assignment_uuid: str
    submission: SubmissionRead | None = None
