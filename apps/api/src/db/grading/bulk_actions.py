"""BulkAction audit rows for teacher-initiated grading operations."""

from datetime import UTC, datetime
from enum import StrEnum
from typing import ClassVar

from pydantic import Field as PydanticField
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlmodel import Field
from ulid import ULID

from src.db.strict_base_model import SQLModelStrictBaseModel
from src.types import JsonObject


class BulkActionType(StrEnum):
    EXTEND_DEADLINE = "EXTEND_DEADLINE"
    RELEASE_GRADES = "RELEASE_GRADES"
    RETURN_ALL = "RETURN_ALL"
    OVERRIDE_SCORE = "OVERRIDE_SCORE"
    BATCH_GRADE = "BATCH_GRADE"


class BulkActionStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class BulkAction(SQLModelStrictBaseModel, table=True):  # type: ignore[misc]
    """Persisted audit record for a teacher bulk operation."""

    __tablename__: ClassVar[str] = "bulk_action"
    __table_args__ = (
        Index("ix_bulk_action_uuid", "action_uuid"),
        Index("ix_bulk_action_activity_status", "activity_id", "status"),
        Index("ix_bulk_action_performed_by", "performed_by"),
    )

    id: int | None = Field(default=None, primary_key=True)
    action_uuid: str = Field(default_factory=lambda: f"bulk_{ULID()}", index=True)
    performed_by: int = Field(
        sa_column=Column(
            "performed_by",
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    action_type: BulkActionType = Field(sa_column=Column("action_type", String, nullable=False))
    params: JsonObject = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    target_user_ids: list[int] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, server_default="[]"),
    )
    activity_id: int = Field(
        sa_column=Column(
            "activity_id",
            ForeignKey("activity.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    status: BulkActionStatus = Field(
        default=BulkActionStatus.PENDING,
        sa_column=Column(
            "status",
            String,
            nullable=False,
            server_default=BulkActionStatus.PENDING,
        ),
    )
    affected_count: int = Field(
        default=0,
        sa_column=Column(Integer, nullable=False, server_default="0"),
    )
    error_log: str = Field(
        default="",
        sa_column=Column(Text, nullable=False, server_default=""),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column("created_at", DateTime(timezone=True), nullable=False),
    )
    completed_at: datetime | None = Field(
        default=None,
        sa_column=Column("completed_at", DateTime(timezone=True), nullable=True),
    )


class BulkActionRead(SQLModelStrictBaseModel):
    id: int
    action_uuid: str
    performed_by: int
    action_type: BulkActionType
    params: JsonObject = PydanticField(default_factory=dict)
    target_user_ids: list[int] = PydanticField(default_factory=list)
    activity_id: int
    status: BulkActionStatus
    affected_count: int
    error_log: str
    created_at: datetime
    completed_at: datetime | None = None
