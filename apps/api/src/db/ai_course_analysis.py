from datetime import datetime
from typing import ClassVar

from pydantic import ConfigDict, Field as PydanticField, field_validator
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, String
from sqlmodel import Field

from src.db.ai_runtime import utc_now
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel
from src.types import JsonObject


class AICourseAnalysis(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_course_analysis"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        Index("idx_ai_course_analysis_uuid", "analysis_uuid", unique=True),
        Index("idx_ai_course_analysis_course_status", "course_id", "status", "created_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    analysis_uuid: str = Field(sa_column=Column(String, nullable=False))
    course_id: int = Field(sa_column=Column(ForeignKey("course.id", ondelete="CASCADE"), nullable=False))
    run_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("ai_run.id", ondelete="SET NULL"), nullable=True),
    )
    triggered_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    status: str = Field(default="draft", sa_column=Column(String, nullable=False))
    language: str = Field(default="auto", sa_column=Column(String, nullable=False))
    public_score: int
    report_json: JsonObject = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    evidence_json: JsonObject = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    model_name: str | None = None
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    published_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))


class AICourseAnalysisRead(PydanticStrictBaseModel):
    id: int
    analysis_uuid: str
    course_id: int
    run_id: int | None = None
    triggered_by_user_id: int | None = None
    status: str
    language: str
    public_score: int
    report_json: JsonObject = PydanticField(default_factory=dict)
    evidence_json: JsonObject = PydanticField(default_factory=dict)
    model_name: str | None = None
    created_at: datetime
    published_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("created_at", "published_at", mode="before")
    @classmethod
    def validate_datetimes(cls, value: object) -> object:
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            return datetime.fromisoformat(value)
        return value
