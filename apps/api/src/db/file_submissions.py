"""First-class file submission activity models."""

from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import ConfigDict, Field, field_validator
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
from sqlmodel import Field as SQLField

from src.db.strict_base_model import (
    PydanticStrictBaseModel,
    SQLModelStrictBaseModel,
    coerce_date_to_end_of_day,
)


class FileSubmissionLifecycle(StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class FileSubmissionAttemptStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    GRADED = "GRADED"
    PUBLISHED = "PUBLISHED"
    RETURNED = "RETURNED"


class FileSubmissionScanStatus(StrEnum):
    PENDING = "PENDING"
    CLEAN = "CLEAN"
    FLAGGED = "FLAGGED"
    ERROR = "ERROR"


class FileSubmissionActivity(SQLModelStrictBaseModel, table=True):
    __tablename__ = "file_submission_activity"
    __table_args__ = (
        UniqueConstraint("activity_id", name="uq_file_submission_activity_id"),
        UniqueConstraint("file_submission_uuid", name="uq_file_submission_activity_uuid"),
        Index("ix_file_submission_activity_uuid", "file_submission_uuid"),
        Index("ix_file_submission_activity_lifecycle", "lifecycle"),
    )

    id: int | None = SQLField(default=None, primary_key=True)
    file_submission_uuid: str
    activity_id: int = SQLField(
        sa_column=Column(
            "activity_id",
            ForeignKey("activity.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    instructions: str = ""
    rubric_json: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    allowed_mime_types: list[str] = SQLField(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, server_default="[]"),
    )
    max_files: int = SQLField(default=1, sa_column=Column(Integer, nullable=False, server_default="1"))
    max_file_size_mb: int | None = None
    due_at: datetime | None = SQLField(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    allow_late: bool = SQLField(default=True, sa_column=Column(Boolean, nullable=False, server_default="true"))
    late_policy_json: dict[str, Any] = SQLField(
        default_factory=lambda: {"kind": "NONE"},
        sa_column=Column(JSON, nullable=False, server_default='{"kind":"NONE"}'),
    )
    max_attempts: int | None = None
    grade_release_mode: str = SQLField(
        default="IMMEDIATE",
        sa_column=Column(String, nullable=False, server_default="IMMEDIATE"),
    )
    lifecycle: FileSubmissionLifecycle = SQLField(
        default=FileSubmissionLifecycle.DRAFT,
        sa_column=Column("lifecycle", String, nullable=False, server_default="DRAFT"),
    )
    published_at: datetime | None = SQLField(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    archived_at: datetime | None = SQLField(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    settings_json: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
            onupdate=func.now(),
        ),
    )

    @field_validator("lifecycle", mode="before")
    @classmethod
    def validate_lifecycle(cls, value: object) -> object:
        if isinstance(value, str):
            return FileSubmissionLifecycle(value)
        return value


class FileSubmissionAttempt(SQLModelStrictBaseModel, table=True):
    __tablename__ = "file_submission_attempt"
    __table_args__ = (
        UniqueConstraint("attempt_uuid", name="uq_file_submission_attempt_uuid"),
        Index("ix_file_submission_attempt_activity_user", "activity_id", "user_id"),
        Index("ix_file_submission_attempt_submission", "file_submission_id", "status"),
    )

    id: int | None = SQLField(default=None, primary_key=True)
    attempt_uuid: str
    file_submission_id: int = SQLField(
        sa_column=Column(
            "file_submission_id",
            ForeignKey("file_submission_activity.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    activity_id: int = SQLField(
        sa_column=Column(
            "activity_id",
            ForeignKey("activity.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    user_id: int = SQLField(sa_column=Column("user_id", ForeignKey("user.id", ondelete="CASCADE")))
    status: FileSubmissionAttemptStatus = SQLField(
        default=FileSubmissionAttemptStatus.DRAFT,
        sa_column=Column("status", String, nullable=False, server_default="DRAFT"),
    )
    attempt_number: int = SQLField(default=1, sa_column=Column(Integer, nullable=False, server_default="1"))
    started_at: datetime | None = SQLField(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    submitted_at: datetime | None = SQLField(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    graded_at: datetime | None = SQLField(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    is_late: bool = SQLField(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    late_penalty_pct: float = SQLField(default=0.0, sa_column=Column(Float, nullable=False, server_default="0"))
    final_score: float | None = None
    feedback_json: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    version: int = SQLField(default=1, sa_column=Column(Integer, nullable=False, server_default="1"))
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
            onupdate=func.now(),
        ),
    )

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, value: object) -> object:
        if isinstance(value, str):
            return FileSubmissionAttemptStatus(value)
        return value


class FileSubmissionAttemptFile(SQLModelStrictBaseModel, table=True):
    __tablename__ = "file_submission_attempt_file"
    __table_args__ = (
        UniqueConstraint("attempt_file_uuid", name="uq_file_submission_file_uuid"),
        UniqueConstraint("attempt_id", "upload_id", name="uq_file_submission_upload"),
        Index("ix_file_submission_file_attempt", "attempt_id", "position"),
    )

    id: int | None = SQLField(default=None, primary_key=True)
    attempt_file_uuid: str
    attempt_id: int = SQLField(
        sa_column=Column(
            "attempt_id",
            ForeignKey("file_submission_attempt.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    upload_id: int = SQLField(
        sa_column=Column(
            "upload_id",
            ForeignKey("upload.id", ondelete="RESTRICT"),
            nullable=False,
        )
    )
    display_name: str = ""
    content_type: str = ""
    size_bytes: int | None = None
    sha256: str | None = None
    storage_key: str | None = None
    position: int = SQLField(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    scan_status: FileSubmissionScanStatus = SQLField(
        default=FileSubmissionScanStatus.PENDING,
        sa_column=Column("scan_status", String, nullable=False, server_default="PENDING"),
    )
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )

    @field_validator("scan_status", mode="before")
    @classmethod
    def validate_scan_status(cls, value: object) -> object:
        if isinstance(value, str):
            return FileSubmissionScanStatus(value)
        return value


class FileSubmissionConfig(PydanticStrictBaseModel):
    instructions: str = ""
    allowed_mime_types: list[str] = Field(default_factory=list)
    max_files: int = Field(default=1, ge=1, le=25)
    max_file_size_mb: int | None = Field(default=None, ge=1, le=500)
    due_at: datetime | None = None
    allow_late: bool = True
    late_policy: dict[str, Any] = Field(default_factory=lambda: {"kind": "NONE"})
    max_attempts: int | None = Field(default=None, ge=1, le=50)
    grade_release_mode: Literal["IMMEDIATE", "BATCH"] = "IMMEDIATE"
    rubric: dict[str, Any] = Field(default_factory=dict)
    settings: dict[str, Any] = Field(default_factory=dict)

    @field_validator("due_at", mode="before")
    @classmethod
    def validate_due_at(cls, v: Any) -> Any:
        return coerce_date_to_end_of_day(v)


class FileSubmissionCreate(FileSubmissionConfig):
    title: str
    course_id: int
    chapter_id: int


class FileSubmissionUpdate(PydanticStrictBaseModel):
    title: str | None = None
    instructions: str | None = None
    allowed_mime_types: list[str] | None = None
    max_files: int | None = Field(default=None, ge=1, le=25)
    max_file_size_mb: int | None = Field(default=None, ge=1, le=500)
    due_at: datetime | None = None
    allow_late: bool | None = None
    late_policy: dict[str, Any] | None = None
    max_attempts: int | None = Field(default=None, ge=1, le=50)
    grade_release_mode: Literal["IMMEDIATE", "BATCH"] | None = None
    rubric: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None

    @field_validator("due_at", mode="before")
    @classmethod
    def validate_due_at(cls, v: Any) -> Any:
        return coerce_date_to_end_of_day(v)


class FileSubmissionFilePatch(PydanticStrictBaseModel):
    upload_uuid: str
    display_name: str | None = None


class FileSubmissionDraftPatch(PydanticStrictBaseModel):
    files: list[FileSubmissionFilePatch] = Field(default_factory=list)


class FileSubmissionGradePatch(PydanticStrictBaseModel):
    final_score: float | None = Field(default=None, ge=0, le=100)
    feedback: str = ""
    rubric: dict[str, Any] = Field(default_factory=dict)
    status: Literal["GRADED", "PUBLISHED", "RETURNED"] = "GRADED"


class FileSubmissionAttemptFileRead(PydanticStrictBaseModel):
    attempt_file_uuid: str
    upload_uuid: str
    filename: str
    content_type: str
    size_bytes: int | None = None
    sha256: str | None = None
    storage_key: str | None = None
    scan_status: FileSubmissionScanStatus
    position: int
    created_at: datetime


class FileSubmissionUserRead(PydanticStrictBaseModel):
    id: int
    username: str
    first_name: str | None = None
    last_name: str | None = None
    email: str
    avatar_image: str | None = None
    user_uuid: str | None = None


class FileSubmissionAttemptRead(PydanticStrictBaseModel):
    attempt_uuid: str
    status: FileSubmissionAttemptStatus
    attempt_number: int
    files: list[FileSubmissionAttemptFileRead] = Field(default_factory=list)
    is_late: bool = False
    late_penalty_pct: float = 0.0
    final_score: float | None = None
    feedback: dict[str, Any] = Field(default_factory=dict)
    version: int = 1
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    graded_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    user: FileSubmissionUserRead | None = None


class FileSubmissionRead(PydanticStrictBaseModel):
    id: int
    file_submission_uuid: str
    activity_id: int
    activity_uuid: str
    course_id: int | None = None
    course_uuid: str | None = None
    chapter_id: int
    title: str
    instructions: str
    lifecycle: FileSubmissionLifecycle
    published: bool
    allowed_mime_types: list[str]
    max_files: int
    max_file_size_mb: int | None = None
    due_at: datetime | None = None
    allow_late: bool = True
    late_policy: dict[str, Any] = Field(default_factory=dict)
    max_attempts: int | None = None
    grade_release_mode: str = "IMMEDIATE"
    rubric: dict[str, Any] = Field(default_factory=dict)
    settings: dict[str, Any] = Field(default_factory=dict)
    current_attempt: FileSubmissionAttemptRead | None = None
    attempts: list[FileSubmissionAttemptRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class FileSubmissionReviewQueue(PydanticStrictBaseModel):
    items: list[FileSubmissionAttemptRead]
    total: int
    page: int = 1
    page_size: int = 25
