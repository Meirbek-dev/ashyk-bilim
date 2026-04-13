from datetime import UTC, datetime

from pydantic import ConfigDict, field_validator
from sqlalchemy import DateTime, String, func
from sqlmodel import Column, Field, ForeignKey, Integer

from src.db.courses.activities import ActivityRead, ActivityReadWithPermissions
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel


class ChapterBase(SQLModelStrictBaseModel):
    name: str
    description: str | None = ""
    thumbnail_image: str | None = ""
    course_id: int = Field(
        sa_column=Column(
            "course_id", Integer, ForeignKey("course.id", ondelete="CASCADE")
        )
    )


class Chapter(ChapterBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    # Override name with a length-constrained column at the DB level.
    name: str = Field(sa_column=Column(String(500), nullable=False))
    chapter_uuid: str = ""
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
    order: int = Field(default=0)
    creator_id: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL")),
    )


class ChapterCreateRequest(PydanticStrictBaseModel):
    """API-facing create schema. Accepts a UUID so internal integer IDs are never exposed."""

    name: str
    description: str | None = ""
    thumbnail_image: str | None = ""
    course_uuid: str


class ChapterUpdate(SQLModelStrictBaseModel):
    name: str | None = None
    description: str | None = None
    thumbnail_image: str | None = None
    # course_id intentionally omitted — chapter-to-course assignment is immutable.


class ChapterRead(ChapterBase):
    id: int
    activities: list[ActivityRead]
    chapter_uuid: str
    creation_date: datetime
    update_date: datetime
    order: int = 0
    model_config = ConfigDict(arbitrary_types_allowed=True)

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


class ChapterReadWithPermissions(ChapterBase):
    """ChapterRead that includes per-activity permission metadata."""

    id: int
    activities: list[ActivityReadWithPermissions]
    chapter_uuid: str
    creation_date: datetime
    update_date: datetime
    order: int = 0
    model_config = ConfigDict(arbitrary_types_allowed=True)

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


class ChapterOrderPayload(PydanticStrictBaseModel):
    """Single-item order update: move this chapter to position N."""

    position: int


class ActivityOrderPayload(PydanticStrictBaseModel):
    """Move an activity to position N, optionally into a different chapter."""

    position: int
    chapter_uuid: str | None = None


class ChapterOrderByUuid(PydanticStrictBaseModel):
    chapter_uuid: str
    activities_order_by_uuids: list[str]


class ChapterUpdateOrder(PydanticStrictBaseModel):
    chapter_order_by_uuids: list[ChapterOrderByUuid]
    # Optional optimistic-concurrency guard: set to the course's current
    # update_date (from GET /courses/{uuid}/meta X-Structure-Version header).
    # When provided the server rejects the request with 409 if the course has
    # changed since the client last loaded it.
    last_known_update_date: datetime | None = None
