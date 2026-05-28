from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class CollectionCourse(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    collection_id: int = Field(sa_column=Column(Integer, ForeignKey("collection.id", ondelete="CASCADE")))
    course_id: int = Field(sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE")))
    creation_date: str
    update_date: str
