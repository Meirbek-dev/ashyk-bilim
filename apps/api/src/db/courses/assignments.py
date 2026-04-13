from datetime import date, datetime
from enum import Enum, StrEnum

from pydantic import ConfigDict, field_validator
from sqlalchemy import JSON, Column, DateTime, ForeignKey
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel
from src.db.users import UserRead


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

    id: int | None = Field(default=None, primary_key=True)
    creation_date: str | None = None
    update_date: str | None = None
    assignment_uuid: str

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

    id: int | None = Field(default=None, primary_key=True)

    assignment_task_uuid: str
    creation_date: str
    update_date: str

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


## AssignmentTaskSubmission ##


class AssignmentTaskSubmissionBase(SQLModelStrictBaseModel):
    """Represents the common fields for an assignment task submission."""

    model_config = ConfigDict(use_enum_values=True)

    assignment_task_submission_uuid: str
    task_submission: dict[str, object] = Field(
        default_factory=dict, sa_column=Column(JSON)
    )
    grade: int = 0  # Value is always between 0-100
    task_submission_grade_feedback: str
    assignment_type: AssignmentTaskTypeEnum

    user_id: int
    activity_id: int
    course_id: int
    chapter_id: int
    assignment_task_id: int

    @field_validator("assignment_type", mode="before")
    @classmethod
    def validate_assignment_type(cls, v):
        if isinstance(v, str):
            return AssignmentTaskTypeEnum(v)
        return v


class AssignmentTaskSubmissionCreate(AssignmentTaskSubmissionBase):
    """Model for creating a new assignment task submission."""

    # Inherits all fields from AssignmentTaskSubmissionBase


class AssignmentTaskSubmissionRead(AssignmentTaskSubmissionBase):
    """Model for reading an assignment task submission."""

    id: int
    creation_date: str
    update_date: str


class AssignmentTaskSubmissionUpdate(SQLModelStrictBaseModel):
    """Model for updating an assignment task submission."""

    model_config = ConfigDict(use_enum_values=True)

    assignment_task_id: int | None = None
    assignment_task_submission_uuid: str | None = None
    task_submission: dict[str, object] | None = Field(
        default=None, sa_column=Column(JSON)
    )
    grade: int | None = None
    task_submission_grade_feedback: str | None = None
    assignment_type: AssignmentTaskTypeEnum | None = None

    @field_validator("assignment_type", mode="before")
    @classmethod
    def validate_assignment_type(cls, v):
        if v is not None and isinstance(v, str):
            return AssignmentTaskTypeEnum(v)
        return v


class AssignmentTaskSubmission(AssignmentTaskSubmissionBase, table=True):
    """Represents a submission for a specific assignment task with grade and feedback."""

    id: int | None = Field(default=None, primary_key=True)
    assignment_task_submission_uuid: str
    task_submission: dict[str, object] = Field(
        default_factory=dict, sa_column=Column(JSON)
    )
    grade: int = 0  # Value is always between 0-100
    task_submission_grade_feedback: str
    assignment_type: AssignmentTaskTypeEnum

    user_id: int = Field(
        sa_column=Column("user_id", ForeignKey("user.id", ondelete="CASCADE"))
    )
    activity_id: int = Field(
        sa_column=Column("activity_id", ForeignKey("activity.id", ondelete="CASCADE"))
    )
    course_id: int = Field(
        sa_column=Column("course_id", ForeignKey("course.id", ondelete="CASCADE"))
    )
    chapter_id: int = Field(
        sa_column=Column("chapter_id", ForeignKey("chapter.id", ondelete="CASCADE"))
    )
    assignment_task_id: int = Field(
        sa_column=Column(
            "assignment_task_id", ForeignKey("assignmenttask.id", ondelete="CASCADE")
        )
    )

    creation_date: str
    update_date: str


## AssignmentTaskSubmission ##

## AssignmentUserSubmission ##


class AssignmentUserSubmissionStatus(StrEnum):
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    GRADED = "GRADED"
    LATE = "LATE"
    NOT_SUBMITTED = "NOT_SUBMITTED"


class AssignmentUserSubmissionBase(SQLModelStrictBaseModel):
    """Represents the submission status of an assignment for a user."""

    model_config = ConfigDict(use_enum_values=True)

    submission_status: AssignmentUserSubmissionStatus = (
        AssignmentUserSubmissionStatus.SUBMITTED
    )
    grade: int
    user_id: int = Field(
        sa_column=Column("user_id", ForeignKey("user.id", ondelete="CASCADE"))
    )
    assignment_id: int = Field(
        sa_column=Column(
            "assignment_id", ForeignKey("assignment.id", ondelete="CASCADE")
        )
    )


class AssignmentUserSubmissionCreate(SQLModelStrictBaseModel):
    """Model for creating a new assignment user submission."""

    model_config = ConfigDict(use_enum_values=True)

    assignment_id: int
    # Note: Other fields will be inherited or set with defaults


class AssignmentUserSubmissionRead(AssignmentUserSubmissionBase):
    """Model for reading an assignment user submission."""

    id: int
    assignmentusersubmission_uuid: str
    creation_date: str
    update_date: str
    submitted_at: datetime | None = None
    graded_at: datetime | None = None

    @field_validator("submitted_at", "graded_at", mode="before")
    @classmethod
    def normalize_tz_offset(cls, v: object) -> object:
        # SQLite/Postgres may return '+00' instead of the ISO 8601 '+00:00'
        if isinstance(v, str) and (v.endswith(("+00", "-00"))):
            v = v + ":00"
        return v


class AssignmentUserSubmissionUpdate(SQLModelStrictBaseModel):
    """Model for updating an assignment user submission."""

    model_config = ConfigDict(use_enum_values=True)

    submission_status: AssignmentUserSubmissionStatus | None = None
    grade: int | None = None
    user_id: int | None = None
    assignment_id: int | None = None


class AssignmentUserSubmissionWithUserRead(AssignmentUserSubmissionRead):
    """Assignment-level submission status enriched with user information."""

    user: UserRead


class AssignmentUserSubmission(AssignmentUserSubmissionBase, table=True):
    """Represents the submission status of an assignment for a user."""

    id: int | None = Field(default=None, primary_key=True)
    creation_date: str
    update_date: str
    submitted_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    graded_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    assignmentusersubmission_uuid: str

    submission_status: AssignmentUserSubmissionStatus = (
        AssignmentUserSubmissionStatus.SUBMITTED
    )
    grade: int
    user_id: int = Field(
        sa_column=Column("user_id", ForeignKey("user.id", ondelete="CASCADE"))
    )
    assignment_id: int = Field(
        sa_column=Column(
            "assignment_id", ForeignKey("assignment.id", ondelete="CASCADE")
        )
    )


class AssignmentCreateWithActivity(SQLModelStrictBaseModel):
    """Model for creating an assignment along with its activity."""

    model_config = ConfigDict(use_enum_values=True)

    title: str
    description: str
    due_date: str
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
