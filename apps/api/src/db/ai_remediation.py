from datetime import datetime
from typing import ClassVar

from pydantic import ConfigDict, Field as PydanticField, field_validator
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, String
from sqlmodel import Field

from src.db.ai_runtime import utc_now
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel
from src.types import JsonObject


class AIRemediationSession(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_remediation_session"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        Index("idx_ai_remediation_uuid", "session_uuid", unique=True),
        Index("idx_ai_remediation_student_activity", "student_user_id", "activity_id", "status"),
        Index("idx_ai_remediation_submission", "submission_id", "created_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    session_uuid: str = Field(sa_column=Column(String, nullable=False))
    submission_id: int = Field(sa_column=Column(ForeignKey("submission.id", ondelete="CASCADE"), nullable=False))
    activity_id: int = Field(sa_column=Column(ForeignKey("activity.id", ondelete="CASCADE"), nullable=False))
    student_user_id: int = Field(sa_column=Column(ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    analysis_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("ai_submission_analysis.id", ondelete="SET NULL"), nullable=True),
    )
    run_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("ai_run.id", ondelete="SET NULL"), nullable=True),
    )
    status: str = Field(default="assigned", sa_column=Column(String, nullable=False))
    gate_mode: bool = False
    language: str = Field(default="auto", sa_column=Column(String, nullable=False))
    lecture_json: JsonObject = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    test_json: JsonObject = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    score: int | None = None
    passed_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))


class AIRemediationSessionRead(PydanticStrictBaseModel):
    id: int
    session_uuid: str
    submission_id: int
    activity_id: int
    student_user_id: int
    analysis_id: int | None = None
    run_id: int | None = None
    status: str
    gate_mode: bool
    language: str
    lecture_json: JsonObject = PydanticField(default_factory=dict)
    test_json: JsonObject = PydanticField(default_factory=dict)
    score: int | None = None
    passed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("passed_at", "created_at", "updated_at", mode="before")
    @classmethod
    def validate_datetimes(cls, value: object) -> object:
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            return datetime.fromisoformat(value)
        return value
