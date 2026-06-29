from datetime import datetime
from typing import ClassVar

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, String
from sqlmodel import Field

from src.db.ai_runtime import utc_now
from src.db.strict_base_model import SQLModelStrictBaseModel
from src.types import JsonObject


class AIStudentMemory(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_student_memory"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        Index("idx_ai_student_memory_student_course", "student_user_id", "course_id", "updated_at"),
        Index("idx_ai_student_memory_source", "source_type", "source_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    student_user_id: int = Field(sa_column=Column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    course_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("course.id", ondelete="CASCADE"), nullable=True),
    )
    source_type: str = Field(sa_column=Column(String, nullable=False))
    source_id: str = Field(sa_column=Column(String, nullable=False))
    memory_text: str
    language: str = Field(default="auto", sa_column=Column(String, nullable=False))
    memory_metadata: JsonObject = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}")
    )
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
