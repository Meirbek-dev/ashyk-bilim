import json
from datetime import UTC, datetime, timezone
from enum import Enum, StrEnum
from uuid import uuid4

from pydantic import ConfigDict, field_validator
from pydantic import Field as PydanticField
from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, func
from sqlmodel import Field

from src.db.courses.chapters import ChapterRead, ChapterReadWithPermissions
from src.db.resource_authors import ResourceAuthorshipEnum, ResourceAuthorshipStatusEnum
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel
from src.db.trails import TrailRead
from src.db.users import UserRead


class ThumbnailType(StrEnum):
    IMAGE = "image"
    VIDEO = "video"
    BOTH = "both"


class AuthorWithRole(SQLModelStrictBaseModel):
    user: UserRead
    authorship: ResourceAuthorshipEnum
    authorship_status: ResourceAuthorshipStatusEnum
    creation_date: str
    update_date: str

    @field_validator("authorship", mode="before")
    @classmethod
    def validate_authorship(cls, v):
        if isinstance(v, str):
            return ResourceAuthorshipEnum(v)
        return v

    @field_validator("authorship_status", mode="before")
    @classmethod
    def validate_authorship_status(cls, v):
        if isinstance(v, str):
            return ResourceAuthorshipStatusEnum(v)
        return v


class CourseBase(SQLModelStrictBaseModel):
    name: str
    description: str | None = None
    about: str | None = None
    learnings: str | None = None
    tags: str | None = None
    thumbnail_type: ThumbnailType | None = Field(default=ThumbnailType.IMAGE)
    thumbnail_image: str | None = Field(default="")
    thumbnail_video: str | None = Field(default="")
    public: bool
    open_to_contributors: bool = False

    @field_validator("learnings", mode="before")
    @classmethod
    def validate_learnings(cls, value):
        if value is None:
            return None
        if isinstance(value, list):
            raw_items = value
        elif isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                parsed = stripped
            raw_items = parsed if isinstance(parsed, list) else [parsed]
        else:
            raw_items = [value]

        normalized_items = []
        for item in raw_items:
            if isinstance(item, str):
                text = item.strip()
                if not text:
                    continue
                normalized_items.append(
                    {"id": uuid4().hex, "text": text, "emoji": "📝"}
                )
                continue

            if not isinstance(item, dict):
                continue

            text = str(item.get("text", "")).strip()
            if not text:
                continue

            normalized_item = {
                "id": str(item.get("id") or uuid4().hex),
                "text": text,
                "emoji": str(item.get("emoji") or "📝"),
            }
            link = str(item.get("link") or "").strip()
            if link:
                normalized_item["link"] = link
            normalized_items.append(normalized_item)

        return json.dumps(normalized_items, ensure_ascii=False)

    @field_validator("tags", mode="before")
    @classmethod
    def validate_tags(cls, value):
        if value is None:
            return None

        raw_tags: list[str]
        if isinstance(value, list):
            raw_tags = [str(tag).strip() for tag in value]
        elif isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                parsed = [segment.strip() for segment in stripped.split(",")]
            if isinstance(parsed, list):
                raw_tags = [str(tag).strip() for tag in parsed]
            else:
                raw_tags = [str(parsed).strip()]
        else:
            raw_tags = [str(value).strip()]

        normalized_tags = []
        for tag in raw_tags:
            if tag and tag not in normalized_tags:
                normalized_tags.append(tag)

        return json.dumps(normalized_tags, ensure_ascii=False)

    @field_validator("thumbnail_type", mode="before")
    @classmethod
    def validate_thumbnail_type(cls, v):
        if isinstance(v, str):
            return ThumbnailType(v)
        return v


class Course(CourseBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    creator_id: int | None = Field(
        default=None,
        sa_column=Column(BigInteger, ForeignKey("user.id", ondelete="SET NULL")),
    )
    course_uuid: str = ""
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


class CourseCreate(CourseBase):
    thumbnail_type: ThumbnailType | None = Field(default=ThumbnailType.IMAGE)
    thumbnail_image: str | None = Field(default="")
    thumbnail_video: str | None = Field(default="")
    # Optional starter template: "blank" (default) or "starter" (seeds 2 default chapters)
    template: str | None = None

    @field_validator("thumbnail_type", mode="before")
    @classmethod
    def validate_thumbnail_type(cls, v):
        if isinstance(v, str):
            return ThumbnailType(v)
        return v


class CourseUpdate(CourseBase):
    name: str
    description: str | None = None
    about: str | None = None
    learnings: str | None = None
    tags: str | None = None
    thumbnail_type: ThumbnailType | None = Field(default=ThumbnailType.IMAGE)
    thumbnail_image: str | None = Field(default="")
    thumbnail_video: str | None = Field(default="")
    public: bool | None = None
    open_to_contributors: bool | None = None

    @field_validator("thumbnail_type", mode="before")
    @classmethod
    def validate_thumbnail_type(cls, v):
        if isinstance(v, str):
            return ThumbnailType(v)
        return v


class CourseMetadataUpdate(PydanticStrictBaseModel):
    name: str | None = None
    description: str | None = None
    about: str | None = None
    learnings: str | None = None
    tags: str | None = None
    thumbnail_type: ThumbnailType | None = None
    last_known_update_date: datetime | None = None

    @field_validator("thumbnail_type", mode="before")
    @classmethod
    def validate_thumbnail_type(cls, v):
        if isinstance(v, str):
            return ThumbnailType(v)
        return v

    @field_validator("learnings", mode="before")
    @classmethod
    def validate_metadata_learnings(cls, value):
        return CourseBase.validate_learnings(value)

    @field_validator("tags", mode="before")
    @classmethod
    def validate_metadata_tags(cls, value):
        return CourseBase.validate_tags(value)

    @field_validator("last_known_update_date", mode="before")
    @classmethod
    def validate_last_known_update_date(cls, value):
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if normalized.endswith("Z"):
                normalized = f"{normalized[:-1]}+00:00"
            return datetime.fromisoformat(normalized)
        return value


class CourseAccessUpdate(PydanticStrictBaseModel):
    public: bool | None = None
    open_to_contributors: bool | None = None
    last_known_update_date: datetime | None = None

    @field_validator("last_known_update_date", mode="before")
    @classmethod
    def validate_last_known_update_date(cls, value):
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if normalized.endswith("Z"):
                normalized = f"{normalized[:-1]}+00:00"
            return datetime.fromisoformat(normalized)
        return value


class CourseRead(PydanticStrictBaseModel):
    id: int
    authors: list[AuthorWithRole] = PydanticField(default_factory=list)
    course_uuid: str
    creation_date: datetime
    update_date: datetime
    thumbnail_type: ThumbnailType | None = PydanticField(default=ThumbnailType.IMAGE)
    thumbnail_image: str | None = PydanticField(default="")
    thumbnail_video: str | None = PydanticField(default="")

    name: str
    description: str | None = None
    about: str | None = None
    learnings: str | None = None
    tags: str | None = None
    public: bool
    open_to_contributors: bool

    model_config = ConfigDict(from_attributes=True)

    @field_validator("thumbnail_type", mode="before")
    @classmethod
    def validate_thumbnail_type(cls, v):
        if isinstance(v, str):
            return ThumbnailType(v)
        return v

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


class FullCourseRead(PydanticStrictBaseModel):
    id: int
    course_uuid: str | None = None
    creation_date: str | None = None
    update_date: str | None = None
    thumbnail_type: ThumbnailType | None = PydanticField(default=ThumbnailType.IMAGE)
    thumbnail_image: str | None = PydanticField(default="")
    thumbnail_video: str | None = PydanticField(default="")
    chapters: list[ChapterReadWithPermissions]
    authors: list[AuthorWithRole]

    name: str
    description: str | None = None
    about: str | None = None
    learnings: str | None = None
    tags: str | None = None
    public: bool
    open_to_contributors: bool

    model_config = ConfigDict(from_attributes=True)

    @field_validator("thumbnail_type", mode="before")
    @classmethod
    def validate_thumbnail_type(cls, v):
        if isinstance(v, str):
            return ThumbnailType(v)
        return v

    @field_validator("creation_date", "update_date", mode="before")
    @classmethod
    def validate_dates(cls, v):
        # Accept datetime values and coerce to ISO strings centrally
        from datetime import datetime

        if isinstance(v, datetime):
            return v.isoformat()
        return v


class FullCourseReadWithTrail(PydanticStrictBaseModel):
    id: int
    course_uuid: str | None = None
    creation_date: str | None = None
    update_date: str | None = None
    authors: list[AuthorWithRole]
    chapters: list[ChapterRead]
    trail: TrailRead | None = None

    name: str
    description: str | None = None
    about: str | None = None
    learnings: str | None = None
    tags: str | None = None
    thumbnail_type: ThumbnailType | None = PydanticField(default=ThumbnailType.IMAGE)
    thumbnail_image: str | None = PydanticField(default="")
    thumbnail_video: str | None = PydanticField(default="")
    public: bool
    open_to_contributors: bool

    model_config = ConfigDict(from_attributes=True)

    @field_validator("thumbnail_type", mode="before")
    @classmethod
    def validate_thumbnail_type(cls, v):
        if isinstance(v, str):
            return ThumbnailType(v)
        return v

    @field_validator("creation_date", "update_date", mode="before")
    @classmethod
    def validate_dates(cls, v):
        # Accept datetime values and coerce to ISO strings centrally
        from datetime import datetime

        if isinstance(v, datetime):
            return v.isoformat()
        return v
