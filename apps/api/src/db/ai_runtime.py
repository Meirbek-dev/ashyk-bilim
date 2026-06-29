"""Persistent AI runtime records for audit, replay, approvals, and evals."""

from datetime import UTC, datetime
from enum import StrEnum
from typing import ClassVar

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Numeric, String
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel
from src.types import JsonObject


def utc_now() -> datetime:
    return datetime.now(UTC)


class AIThreadRole(StrEnum):
    STUDENT = "student"
    TEACHER = "teacher"
    AUTHOR = "author"
    ADMIN = "admin"


class AIRetentionClass(StrEnum):
    TRANSIENT = "transient"
    GENERATED_AI = "generated_ai"
    EDUCATIONAL_RECORD = "educational_record"
    AUDIT = "audit"


class AIRunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    FINISHED = "finished"
    ERROR = "error"
    ABORTED = "aborted"


class AIApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    EXPIRED = "expired"


class AIThread(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_thread"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        Index("idx_ai_thread_uuid", "thread_uuid", unique=True),
        Index("idx_ai_thread_user_role", "user_id", "role", "updated_at"),
        Index("idx_ai_thread_course_activity", "course_id", "activity_id", "updated_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    thread_uuid: str = Field(sa_column=Column(String, nullable=False))
    user_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    role: str = Field(default=AIThreadRole.STUDENT.value, sa_column=Column(String, nullable=False))
    course_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("course.id", ondelete="SET NULL"), nullable=True),
    )
    activity_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("activity.id", ondelete="SET NULL"), nullable=True),
    )
    title: str | None = None
    retention_class: str = Field(
        default=AIRetentionClass.GENERATED_AI.value,
        sa_column=Column(String, nullable=False),
    )
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))


class AIRun(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_run"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        Index("idx_ai_run_uuid", "run_uuid", unique=True),
        Index("idx_ai_run_thread_status", "thread_id", "status", "started_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    run_uuid: str = Field(sa_column=Column(String, nullable=False))
    thread_id: int = Field(sa_column=Column(ForeignKey("ai_thread.id", ondelete="CASCADE"), nullable=False))
    model_name: str | None = None
    status: str = Field(default=AIRunStatus.QUEUED.value, sa_column=Column(String, nullable=False))
    duration_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_estimate: float | None = Field(default=None, sa_column=Column(Numeric(12, 6), nullable=True))
    safety_state: str | None = None
    error_code: str | None = None
    run_metadata: JsonObject = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    started_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))


class AIEvent(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_event"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        Index("idx_ai_event_run_sequence", "run_id", "sequence", unique=True),
        Index("idx_ai_event_event_id", "event_id", unique=True),
    )

    id: int | None = Field(default=None, primary_key=True)
    run_id: int = Field(sa_column=Column(ForeignKey("ai_run.id", ondelete="CASCADE"), nullable=False))
    event_id: str = Field(sa_column=Column(String, nullable=False))
    event_type: str = Field(sa_column=Column(String, nullable=False))
    sequence: int
    payload_json: JsonObject = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))


class AIArtifactRecord(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_artifact"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        Index("idx_ai_artifact_uuid", "artifact_uuid", unique=True),
        Index("idx_ai_artifact_run_kind", "run_id", "kind", "created_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    artifact_uuid: str = Field(sa_column=Column(String, nullable=False))
    run_id: int = Field(sa_column=Column(ForeignKey("ai_run.id", ondelete="CASCADE"), nullable=False))
    kind: str = Field(sa_column=Column(String, nullable=False))
    content_json: JsonObject = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    final: bool = False
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))


class AIEvidence(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_evidence"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (Index("idx_ai_evidence_run", "run_id", "source_type", "created_at"),)

    id: int | None = Field(default=None, primary_key=True)
    run_id: int = Field(sa_column=Column(ForeignKey("ai_run.id", ondelete="CASCADE"), nullable=False))
    artifact_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("ai_artifact.id", ondelete="SET NULL"), nullable=True),
    )
    citation_id: str = Field(sa_column=Column(String, nullable=False))
    label: str = Field(sa_column=Column(String, nullable=False))
    source_type: str = Field(sa_column=Column(String, nullable=False))
    excerpt: str
    score: float | None = Field(default=None, sa_column=Column(Numeric(6, 4), nullable=True))
    evidence_metadata: JsonObject = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}")
    )
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))


class AIApproval(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_approval"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        Index("idx_ai_approval_uuid", "approval_uuid", unique=True),
        Index("idx_ai_approval_status", "status", "expires_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    approval_uuid: str = Field(sa_column=Column(String, nullable=False))
    run_id: int = Field(sa_column=Column(ForeignKey("ai_run.id", ondelete="CASCADE"), nullable=False))
    action_type: str = Field(sa_column=Column(String, nullable=False))
    status: str = Field(default=AIApprovalStatus.PENDING.value, sa_column=Column(String, nullable=False))
    requested_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    resolved_by_user_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
    )
    payload_json: JsonObject = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    resolved_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    expires_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))


class AIEvalResult(SQLModelStrictBaseModel, table=True):
    __tablename__: ClassVar[str] = "ai_eval_result"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        Index("idx_ai_eval_uuid", "eval_uuid", unique=True),
        Index("idx_ai_eval_dataset", "dataset", "created_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    eval_uuid: str = Field(sa_column=Column(String, nullable=False))
    run_id: int | None = Field(
        default=None,
        sa_column=Column(ForeignKey("ai_run.id", ondelete="SET NULL"), nullable=True),
    )
    dataset: str = Field(sa_column=Column(String, nullable=False))
    evaluator: str = Field(sa_column=Column(String, nullable=False))
    score: float | None = Field(default=None, sa_column=Column(Numeric(6, 4), nullable=True))
    passed: bool | None = None
    details_json: JsonObject = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, server_default="{}"))
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
