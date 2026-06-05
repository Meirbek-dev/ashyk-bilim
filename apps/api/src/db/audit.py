"""AuditEvent — append-only log for non-grade actions.

Records policy overrides, lifecycle transitions, bulk operations, and
deadline extensions for compliance and debugging.
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import ClassVar

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, String
from sqlmodel import Field

from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel
from src.types import JsonObject


class AuditEventType(StrEnum):
    POLICY_OVERRIDE_CREATED = "POLICY_OVERRIDE_CREATED"
    POLICY_OVERRIDE_UPDATED = "POLICY_OVERRIDE_UPDATED"
    POLICY_OVERRIDE_DELETED = "POLICY_OVERRIDE_DELETED"
    LIFECYCLE_TRANSITION = "LIFECYCLE_TRANSITION"
    BULK_PUBLISH = "BULK_PUBLISH"
    BULK_RETURN = "BULK_RETURN"
    DEADLINE_EXTEND = "DEADLINE_EXTEND"
    BATCH_GRADE = "BATCH_GRADE"


class AuditEvent(SQLModelStrictBaseModel, table=True):  # type: ignore[misc]
    """Immutable audit log entry for non-grade actions."""

    __tablename__: ClassVar[str] = "audit_event"
    __table_args__ = (
        Index(
            "idx_audit_event_target",
            "target_kind",
            "target_uuid",
            "created_at",
        ),
        Index("idx_audit_event_actor", "actor_id", "created_at"),
        Index("idx_audit_event_uuid", "event_uuid", unique=True),
    )

    id: int | None = Field(default=None, primary_key=True)
    event_uuid: str = Field(sa_column=Column(String, nullable=False))
    actor_id: int | None = Field(
        default=None,
        sa_column=Column(
            "actor_id",
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    event_type: str = Field(sa_column=Column("event_type", String, nullable=False))
    target_kind: str = Field(sa_column=Column("target_kind", String, nullable=False))
    target_uuid: str = Field(sa_column=Column("target_uuid", String, nullable=False))
    payload_json: JsonObject = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, server_default="{}"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class AuditEventRead(PydanticStrictBaseModel):
    """API projection of an audit event."""

    id: int
    event_uuid: str
    actor_id: int | None = None
    event_type: str
    target_kind: str
    target_uuid: str
    payload_json: JsonObject
    created_at: datetime
