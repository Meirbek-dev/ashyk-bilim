from datetime import date, datetime
from enum import StrEnum
from typing import Literal

from pydantic import ConfigDict, field_validator
from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
)
from sqlmodel import Field

from src.db.grading.submissions import SubmissionRead
from src.db.strict_base_model import SQLModelStrictBaseModel


def _normalize_due_date_value(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if normalized == "":
        return ""

    try:
        if "T" in normalized:
            datetime.fromisoformat(normalized)
        else:
            date.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(
            "due_date must be a valid ISO 8601 date or datetime string"
        ) from exc

    return normalized


def _validate_max_grade_value(value: int | None) -> int | None:
    if value is None:
        return None
    if not 0 <= value <= 100:
        raise ValueError("max_grade_value must be between 0 and 100")
    return value


## Assignment ##
class GradingTypeEnum(StrEnum):
    NUMERIC = "NUMERIC"
    PERCENTAGE = "PERCENTAGE"


class AssignmentBase(SQLModelStrictBaseModel):
    """Represents the common fields for an assignment."""

    model_config = ConfigDict(use_enum_values=True)

    title: str
    description: str
    due_date: str
    due_at: datetime | None = None
    published: bool | None = False
    grading_type: GradingTypeEnum

    course_id: int
    chapter_id: int
    activity_id: int

    @field_validator("grading_type", mode="before")
    @classmethod
    def validate_grading_type(cls, v):
        if isinstance(v, str):
            return GradingTypeEnum(v)
        return v

    @field_validator("due_date", mode="before")
    @classmethod
    def validate_due_date(cls, v):
        return _normalize_due_date_value(v)


class AssignmentCreate(AssignmentBase):
    """Model for creating a new assignment."""

    # Inherits all fields from AssignmentBase


class AssignmentRead(AssignmentBase):
    """Model for reading an assignment."""

    id: int
    assignment_uuid: str
    course_uuid: str | None = None
    activity_uuid: str | None = None
    creation_date: str | None = None
    update_date: str | None = None


class AssignmentUpdate(SQLModelStrictBaseModel):
    """Model for updating an assignment."""

    model_config = ConfigDict(use_enum_values=True)

    title: str | None = None
    description: str | None = None
    due_date: str | None = None
    due_at: datetime | None = None
    published: bool | None = None
    grading_type: GradingTypeEnum | None = None
    course_id: int | None = None
    chapter_id: int | None = None
    activity_id: int | None = None
    update_date: str | None = None

    @field_validator("grading_type", mode="before")
    @classmethod
    def validate_grading_type(cls, v):
        if v is not None and isinstance(v, str):
            return GradingTypeEnum(v)
        return v

    @field_validator("due_date", mode="before")
    @classmethod
    def validate_due_date(cls, v):
        return _normalize_due_date_value(v)


class Assignment(AssignmentBase, table=True):
    """Represents an assignment with relevant details and foreign keys."""

    __table_args__ = (
        UniqueConstraint("activity_id", name="uq_assignment_activity_id"),
        Index("idx_assignment_activity_id", "activity_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    creation_date: str | None = None
    update_date: str | None = None
    assignment_uuid: str
    due_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
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


## Assignment ##

## AssignmentTask ##


class AssignmentTaskTypeEnum(StrEnum):
    FILE_SUBMISSION = "FILE_SUBMISSION"
    QUIZ = "QUIZ"
    FORM = "FORM"  # soon to be implemented
    OTHER = "OTHER"


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
    prevent_copy: bool = True
    track_violations: bool = True
    max_violations: int = 2
    block_on_violations: bool = True


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


class AssignmentTaskBase(SQLModelStrictBaseModel):
    """Represents the common fields for an assignment task."""

    model_config = ConfigDict(use_enum_values=True)

    title: str
    description: str
    hint: str
    reference_file: str | None = None
    assignment_type: AssignmentTaskTypeEnum
    contents: dict[str, object] = Field(default_factory=dict, sa_column=Column(JSON))
    max_grade_value: int = 0  # Value is always between 0-100

    @field_validator("assignment_type", mode="before")
    @classmethod
    def validate_assignment_type(cls, v):
        if isinstance(v, str):
            return AssignmentTaskTypeEnum(v)
        return v

    @field_validator("max_grade_value")
    @classmethod
    def validate_max_grade_value(cls, v: int) -> int:
        validated = _validate_max_grade_value(v)
        return 0 if validated is None else validated


class AssignmentTaskCreate(AssignmentTaskBase):
    """Model for creating a new assignment task."""

    # Inherits all fields from AssignmentTaskBase


class AssignmentTaskRead(AssignmentTaskBase):
    """Model for reading an assignment task."""

    id: int
    assignment_task_uuid: str
    order: int = 0


class AssignmentTaskUpdate(SQLModelStrictBaseModel):
    """Model for updating an assignment task."""

    model_config = ConfigDict(use_enum_values=True)

    title: str | None = None
    description: str | None = None
    hint: str | None = None
    reference_file: str | None = None
    assignment_type: AssignmentTaskTypeEnum | None = None
    contents: dict[str, object] | None = Field(default=None, sa_column=Column(JSON))
    max_grade_value: int | None = None
    order: int | None = None

    @field_validator("assignment_type", mode="before")
    @classmethod
    def validate_assignment_type(cls, v):
        if v is not None and isinstance(v, str):
            return AssignmentTaskTypeEnum(v)
        return v

    @field_validator("max_grade_value")
    @classmethod
    def validate_max_grade_value(cls, v: int | None) -> int | None:
        return _validate_max_grade_value(v)


class AssignmentTask(AssignmentTaskBase, table=True):
    """Represents a task within an assignment with various attributes and foreign keys."""

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
    creation_date: str
    update_date: str
    order: int = Field(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default="0"),
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


## AssignmentTask ##


class AssignmentCreateWithActivity(SQLModelStrictBaseModel):
    """Model for creating an assignment along with its activity."""

    model_config = ConfigDict(use_enum_values=True)

    title: str
    description: str
    due_date: str
    due_at: datetime | None = None
    published: bool = False
    grading_type: GradingTypeEnum
    course_id: int
    chapter_id: int

    @field_validator("grading_type", mode="before")
    @classmethod
    def validate_grading_type(cls, v):
        if isinstance(v, str):
            return GradingTypeEnum(v)
        return v

    @field_validator("due_date", mode="before")
    @classmethod
    def validate_due_date(cls, v):
        return _normalize_due_date_value(v)


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
