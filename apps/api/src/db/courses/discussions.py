from datetime import UTC, datetime
from enum import StrEnum

from pydantic import field_validator
from sqlalchemy import Column, DateTime, ForeignKey, Integer, func
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel
from src.db.users import UserRead


class DiscussionType(StrEnum):
    POST = "post"
    REPLY = "reply"


class DiscussionStatusEnum(StrEnum):
    ACTIVE = "active"
    HIDDEN = "hidden"
    DELETED = "deleted"


class CourseDiscussion(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    discussion_uuid: str = Field(default="")
    content: str
    type: DiscussionType = Field(default=DiscussionType.POST)
    status: DiscussionStatusEnum = Field(default=DiscussionStatusEnum.ACTIVE)
    course_id: int = Field(sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE")))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE")))
    parent_discussion_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("coursediscussion.id", ondelete="CASCADE")),
    )
    likes_count: int = Field(default=0)
    dislikes_count: int = Field(default=0)
    replies_count: int = Field(default=0)
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )

    @field_validator("type", mode="before")
    @classmethod
    def validate_type(cls, v: object) -> object:
        if isinstance(v, str):
            return DiscussionType(v)
        return v

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: object) -> object:
        if isinstance(v, str):
            return DiscussionStatusEnum(v)
        return v


class CourseDiscussionCreate(SQLModelStrictBaseModel):
    content: str
    type: DiscussionType = DiscussionType.POST
    parent_discussion_id: int | None = None

    @field_validator("type", mode="before")
    @classmethod
    def validate_type(cls, v: object) -> object:
        if isinstance(v, str):
            try:
                return DiscussionType(v)
            except ValueError:
                return DiscussionType.POST
        return v

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: object) -> object:
        if not v:
            msg = "Content cannot be empty"
            raise ValueError(msg)

        # Strip HTML tags to check if there's actual text content
        import re

        clean_text = re.sub(r"<[^>]+>", "", str(v)).strip()
        if not clean_text:
            msg = "Content cannot be empty"
            raise ValueError(msg)

        return v


class CourseDiscussionRead(SQLModelStrictBaseModel):
    id: int
    discussion_uuid: str
    content: str
    type: DiscussionType
    status: DiscussionStatusEnum
    course_id: int
    user_id: int
    parent_discussion_id: int | None
    likes_count: int
    dislikes_count: int
    replies_count: int
    creation_date: datetime
    update_date: datetime
    user: UserRead | None = None
    replies: list[CourseDiscussionRead] | None = None
    is_liked: bool = False
    is_disliked: bool = False

    @field_validator("type", mode="before")
    @classmethod
    def validate_type(cls, v: object) -> object:
        if isinstance(v, str):
            return DiscussionType(v)
        return v

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: object) -> object:
        if isinstance(v, str):
            return DiscussionStatusEnum(v)
        return v


class CourseDiscussionReadWithPermissions(CourseDiscussionRead):
    """Discussion response with permission metadata."""

    can_update: bool
    can_delete: bool
    can_moderate: bool
    is_owner: bool
    is_creator: bool
    available_actions: list[str]


class CourseDiscussionUpdate(SQLModelStrictBaseModel):
    content: str | None = None
    status: DiscussionStatusEnum | None = None

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: object) -> object:
        if v is not None and isinstance(v, str):
            return DiscussionStatusEnum(v)
        return v


class DiscussionLike(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    discussion_id: int = Field(sa_column=Column(Integer, ForeignKey("coursediscussion.id", ondelete="CASCADE")))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE")))
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class DiscussionLikeCreate(SQLModelStrictBaseModel):
    discussion_id: int


class DiscussionLikeRead(SQLModelStrictBaseModel):
    id: int
    discussion_id: int
    user_id: int
    creation_date: datetime


class DiscussionDislike(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    discussion_id: int = Field(sa_column=Column(Integer, ForeignKey("coursediscussion.id", ondelete="CASCADE")))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE")))
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )


class DiscussionDislikeCreate(SQLModelStrictBaseModel):
    discussion_id: int


class DiscussionDislikeRead(SQLModelStrictBaseModel):
    id: int
    discussion_id: int
    user_id: int
    creation_date: datetime
