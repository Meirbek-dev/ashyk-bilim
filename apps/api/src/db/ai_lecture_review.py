from datetime import datetime
from typing import ClassVar

from pydantic import ConfigDict, Field as PydanticField, field_validator
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, String
from sqlmodel import Field

from src.db.ai_runtime import utc_now
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel
from src.types import JsonObject


class AILectureReview(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_lecture_review"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        Index("idx_ai_lecture_review_uuid", "review_uuid", unique=True),
        Index("idx_ai_lecture_review_activity_status", "activity_id", "status", "created_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    review_uuid: str = Field(sa_column=Column(String, nullable=False))
    course_id: int = Field(sa_column=Column(ForeignKey("course.id", ondelete="CASCADE"), nullable=False))
    activity_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("activity.id", ondelete="CASCADE"), nullable=True),
    )
    run_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("ai_run.id", ondelete="SET NULL"), nullable=True),
    )
    triggered_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    status: str = Field(default="active", sa_column=Column(String, nullable=False))
    language: str = Field(default="auto", sa_column=Column(String, nullable=False))
    suggestions_json: JsonObject = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}")
    )
    dismissed_json: JsonObject = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}")
    )
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    superseded_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))


class AILectureReviewRead(PydanticStrictBaseModel):
    id: int
    review_uuid: str
    course_id: int
    activity_id: int | None = None
    run_id: int | None = None
    triggered_by_user_id: int | None = None
    status: str
    language: str
    suggestions_json: JsonObject = PydanticField(default_factory=dict)
    dismissed_json: JsonObject = PydanticField(default_factory=dict)
    created_at: datetime
    superseded_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("created_at", "superseded_at", mode="before")
    @classmethod
    def validate_datetimes(cls, value: object) -> object:
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            return datetime.fromisoformat(value)
        return value
