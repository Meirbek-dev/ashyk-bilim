from datetime import UTC, datetime, timezone
from enum import Enum, StrEnum

from pydantic import ConfigDict, field_validator, model_validator
from sqlalchemy import (
    JSON,
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class ActivityTypeEnum(StrEnum):
    TYPE_VIDEO = "TYPE_VIDEO"
    TYPE_DOCUMENT = "TYPE_DOCUMENT"
    TYPE_DYNAMIC = "TYPE_DYNAMIC"
    TYPE_ASSIGNMENT = "TYPE_ASSIGNMENT"
    TYPE_EXAM = "TYPE_EXAM"
    TYPE_CODE_CHALLENGE = "TYPE_CODE_CHALLENGE"
    TYPE_CUSTOM = "TYPE_CUSTOM"


class ActivitySubTypeEnum(StrEnum):
    # Dynamic
    SUBTYPE_DYNAMIC_PAGE = "SUBTYPE_DYNAMIC_PAGE"
    # Video
    SUBTYPE_VIDEO_YOUTUBE = "SUBTYPE_VIDEO_YOUTUBE"
    SUBTYPE_VIDEO_HOSTED = "SUBTYPE_VIDEO_HOSTED"
    # Document
    SUBTYPE_DOCUMENT_PDF = "SUBTYPE_DOCUMENT_PDF"
    SUBTYPE_DOCUMENT_DOC = "SUBTYPE_DOCUMENT_DOC"
    # Assignment
    SUBTYPE_ASSIGNMENT_ANY = "SUBTYPE_ASSIGNMENT_ANY"
    # Exam
    SUBTYPE_EXAM_STANDARD = "SUBTYPE_EXAM_STANDARD"
    # Code Challenge
    SUBTYPE_CODE_GENERAL = "SUBTYPE_CODE_GENERAL"
    SUBTYPE_CODE_COMPETITIVE = "SUBTYPE_CODE_COMPETITIVE"
    # Custom
    SUBTYPE_CUSTOM = "SUBTYPE_CUSTOM"


class AssessmentLifecycleStatus(StrEnum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class ActivityBase(SQLModelStrictBaseModel):
    name: str
    activity_type: ActivityTypeEnum
    activity_sub_type: ActivitySubTypeEnum
    content: dict[str, object] = Field(default_factory=dict, sa_column=Column(JSON))
    details: dict[str, object] | None = Field(default=None, sa_column=Column(JSON))
    settings: dict[str, object] = Field(default_factory=dict, sa_column=Column(JSON))
    published: bool = False

    @field_validator("activity_type", mode="before")
    @classmethod
    def validate_activity_type(cls, v):
        if isinstance(v, str):
            return ActivityTypeEnum(v)
        return v

    @field_validator("activity_sub_type", mode="before")
    @classmethod
    def validate_activity_sub_type(cls, v):
        if isinstance(v, str):
            return ActivitySubTypeEnum(v)
        return v


class Activity(ActivityBase, table=True):
    model_config = ConfigDict(from_attributes=True)

    id: int | None = Field(default=None, primary_key=True)
    # Override name with a length-constrained column at the DB level.
    name: str = Field(sa_column=Column(String(500), nullable=False))
    # Primary FK: activities belong to a chapter (cascades on chapter delete)
    chapter_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("chapter.id", ondelete="CASCADE"), nullable=False
        ),
    )
    # Denormalised FK kept for query performance; synced on create/move.
    # The canonical source of truth is chapter_id → Chapter.course_id.
    course_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("course.id", ondelete="SET NULL")),
    )
    # order within the chapter
    order: int = Field(default=0)
    creator_id: int | None = Field(
        default=None,
        sa_column=Column(BigInteger, ForeignKey("user.id", ondelete="SET NULL")),
    )
    activity_uuid: str = ""
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(tz=UTC),
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
        ),
    )


_VALID_SUBTYPES: dict[ActivityTypeEnum, set[ActivitySubTypeEnum]] = {
    ActivityTypeEnum.TYPE_VIDEO: {
        ActivitySubTypeEnum.SUBTYPE_VIDEO_YOUTUBE,
        ActivitySubTypeEnum.SUBTYPE_VIDEO_HOSTED,
    },
    ActivityTypeEnum.TYPE_DOCUMENT: {
        ActivitySubTypeEnum.SUBTYPE_DOCUMENT_PDF,
        ActivitySubTypeEnum.SUBTYPE_DOCUMENT_DOC,
    },
    ActivityTypeEnum.TYPE_DYNAMIC: {ActivitySubTypeEnum.SUBTYPE_DYNAMIC_PAGE},
    ActivityTypeEnum.TYPE_ASSIGNMENT: {ActivitySubTypeEnum.SUBTYPE_ASSIGNMENT_ANY},
    ActivityTypeEnum.TYPE_EXAM: {ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD},
    ActivityTypeEnum.TYPE_CODE_CHALLENGE: {
        ActivitySubTypeEnum.SUBTYPE_CODE_GENERAL,
        ActivitySubTypeEnum.SUBTYPE_CODE_COMPETITIVE,
    },
    ActivityTypeEnum.TYPE_CUSTOM: {ActivitySubTypeEnum.SUBTYPE_CUSTOM},
}


class ActivityCreate(ActivityBase):
    chapter_id: int
    activity_type: ActivityTypeEnum = ActivityTypeEnum.TYPE_CUSTOM
    activity_sub_type: ActivitySubTypeEnum = ActivitySubTypeEnum.SUBTYPE_CUSTOM
    details: dict[str, object] = Field(default_factory=dict, sa_column=Column(JSON))
    settings: dict[str, object] = Field(default_factory=dict, sa_column=Column(JSON))

    @model_validator(mode="after")
    def subtype_matches_type(self):
        allowed = _VALID_SUBTYPES.get(self.activity_type, set())
        if allowed and self.activity_sub_type not in allowed:
            msg = (
                f"activity_sub_type {self.activity_sub_type!r} is not valid for "
                f"activity_type {self.activity_type!r}. "
                f"Allowed: {sorted(s.value for s in allowed)}"
            )
            raise ValueError(msg)
        return self


class ActivityUpdate(ActivityBase):
    name: str | None = None
    activity_type: ActivityTypeEnum | None = None
    activity_sub_type: ActivitySubTypeEnum | None = None
    content: dict[str, object] | None = None
    details: dict[str, object] | None = None
    settings: dict[str, object] | None = None
    published: bool | None = None

    @model_validator(mode="after")
    def subtype_matches_type(self):
        if self.activity_type is not None and self.activity_sub_type is not None:
            allowed = _VALID_SUBTYPES.get(self.activity_type, set())
            if allowed and self.activity_sub_type not in allowed:
                msg = (
                    f"activity_sub_type {self.activity_sub_type!r} is not valid for "
                    f"activity_type {self.activity_type!r}. "
                    f"Allowed: {sorted(s.value for s in allowed)}"
                )
                raise ValueError(msg)
        return self


class ActivityRead(ActivityBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    chapter_id: int
    course_id: int | None = None
    order: int = 0
    activity_uuid: str
    creation_date: datetime
    update_date: datetime

    @field_validator("creation_date", "update_date", mode="before")
    @classmethod
    def validate_datetimes(cls, v):
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            value = v.strip()
            if value.endswith("Z"):
                value = f"{value[:-1]}+00:00"
            return datetime.fromisoformat(value)
        return v


class ActivityAssessmentPolicyRead(SQLModelStrictBaseModel):
    id: int
    policy_uuid: str
    assessment_type: str
    max_attempts: int | None = None
    time_limit_seconds: int | None = None
    due_at: datetime | None = None
    late_policy_json: dict[str, object] = Field(default_factory=dict)
    anti_cheat_json: dict[str, object] = Field(default_factory=dict)
    settings_json: dict[str, object] = Field(default_factory=dict)


class ActivityReadWithPermissions(ActivityRead):
    """Activity response with permission metadata."""

    can_update: bool
    can_delete: bool
    is_owner: bool
    is_creator: bool
    assessment_policy: ActivityAssessmentPolicyRead | None = None
