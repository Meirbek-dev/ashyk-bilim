from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, func
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class CollectionCourse(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    collection_id: int = Field(sa_column=Column(Integer, ForeignKey("collection.id", ondelete="CASCADE")))
    course_id: int = Field(sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE")))
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )
