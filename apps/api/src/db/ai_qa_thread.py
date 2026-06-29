from datetime import datetime
from typing import ClassVar

from pydantic import ConfigDict, Field as PydanticField, field_validator
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, String
from sqlmodel import Field

from src.db.ai_runtime import utc_now
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel
from src.types import JsonObject


class AIQAMessage(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_qa_message"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        Index("idx_ai_qa_message_uuid", "message_uuid", unique=True),
        Index("idx_ai_qa_thread_order", "thread_id", "created_at"),
        Index("idx_ai_qa_course_user", "course_id", "user_id", "created_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    message_uuid: str = Field(sa_column=Column(String, nullable=False))
    thread_id: int = Field(sa_column=Column(ForeignKey("ai_thread.id", ondelete="CASCADE"), nullable=False))
    course_id: int = Field(sa_column=Column(ForeignKey("course.id", ondelete="CASCADE"), nullable=False))
    user_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    role: str = Field(sa_column=Column(String, nullable=False))
    content: str
    confidence: str | None = None
    citations_json: JsonObject = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}")
    )
    message_metadata: JsonObject = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}")
    )
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))


class AIQAMessageRead(PydanticStrictBaseModel):
    id: int
    message_uuid: str
    thread_id: int
    course_id: int
    user_id: int | None = None
    role: str
    content: str
    confidence: str | None = None
    citations_json: JsonObject = PydanticField(default_factory=dict)
    message_metadata: JsonObject = PydanticField(default_factory=dict)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("created_at", mode="before")
    @classmethod
    def validate_created_at(cls, value: object) -> object:
        if isinstance(value, str):
            return datetime.fromisoformat(value)
        return value
