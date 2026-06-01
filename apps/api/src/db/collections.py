from datetime import UTC, datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, func
from sqlmodel import Field

from src.db.courses.courses import CourseRead
from src.db.strict_base_model import SQLModelStrictBaseModel


class CollectionBase(SQLModelStrictBaseModel):
    name: str
    public: bool
    description: str | None = ""


class Collection(CollectionBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    creator_id: int | None = Field(
        default=None,
        sa_column=Column(BigInteger, ForeignKey("user.id", ondelete="SET NULL")),
    )
    collection_uuid: str = ""
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class CollectionCreate(CollectionBase):
    courses: list[int]


class CollectionUpdate(SQLModelStrictBaseModel):
    courses: list[int] | None = None
    name: str | None = None
    public: bool | None = None
    description: str | None = ""


class CollectionRead(CollectionBase):
    id: int
    creator_id: int | None = None
    courses: list[CourseRead]
    collection_uuid: str
    creation_date: datetime
    update_date: datetime


class CollectionReadWithPermissions(CollectionRead):
    """Collection response with permission metadata for frontend."""

    can_update: bool
    can_delete: bool
    is_owner: bool
