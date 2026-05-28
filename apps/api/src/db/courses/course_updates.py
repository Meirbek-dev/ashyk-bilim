from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class CourseUpdate(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    courseupdate_uuid: str
    title: str
    content: str
    course_id: int = Field(sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE")))
    linked_activity_uuids: str | None = Field(default=None)
    creation_date: str
    update_date: str


class CourseUpdateCreate(SQLModelStrictBaseModel):
    title: str
    content: str
    linked_activity_uuids: str | None = Field(default=None)


class CourseUpdateRead(SQLModelStrictBaseModel):
    id: int
    title: str
    content: str
    course_id: int
    courseupdate_uuid: str
    linked_activity_uuids: str | None = Field(default=None)
    creation_date: str
    update_date: str


class CourseUpdateUpdate(SQLModelStrictBaseModel):
    title: str | None = None
    content: str | None = None
    linked_activity_uuids: str | None = Field(default=None)
