"""Durable Judge0 execution records for canonical code challenges."""

from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import Boolean, Column, DateTime, Float, Index, Integer, String, Text
from sqlmodel import Field as SQLField

from src.db.strict_base_model import SQLModelStrictBaseModel


class CodeRunPurpose(StrEnum):
    CUSTOM = "CUSTOM"
    VISIBLE = "VISIBLE"
    FINAL = "FINAL"
    REFERENCE_CHECK = "REFERENCE_CHECK"


class CodeRunStatus(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    ACCEPTED = "ACCEPTED"
    WRONG_ANSWER = "WRONG_ANSWER"
    COMPILE_ERROR = "COMPILE_ERROR"
    RUNTIME_ERROR = "RUNTIME_ERROR"
    TIME_LIMIT = "TIME_LIMIT"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    DEGRADED = "DEGRADED"


class CodeRun(SQLModelStrictBaseModel, table=True):
    """One student/teacher code execution request."""

    __tablename__ = "code_run"
    __table_args__ = (
        Index("ix_code_run_uuid", "run_uuid", unique=True),
        Index("ix_code_run_assessment_item", "assessment_uuid", "item_uuid"),
        Index("ix_code_run_user_item_purpose", "user_id", "item_uuid", "purpose"),
        Index(
            "uq_code_run_idempotency",
            "user_id",
            "item_uuid",
            "purpose",
            "idempotency_key",
            unique=True,
        ),
    )

    id: int | None = SQLField(default=None, primary_key=True)
    run_uuid: str = SQLField(sa_column=Column(String, nullable=False))
    assessment_uuid: str = SQLField(sa_column=Column(String, nullable=False))
    item_uuid: str = SQLField(sa_column=Column(String, nullable=False))
    submission_uuid: str | None = SQLField(default=None, sa_column=Column(String))
    user_id: int = SQLField(sa_column=Column(Integer, nullable=False))
    purpose: CodeRunPurpose = SQLField(sa_column=Column(String, nullable=False))
    status: CodeRunStatus = SQLField(
        default=CodeRunStatus.QUEUED,
        sa_column=Column(String, nullable=False, server_default=CodeRunStatus.QUEUED.value),
    )
    language_id: int = SQLField(sa_column=Column(Integer, nullable=False))
    source_sha256: str = SQLField(sa_column=Column(String(64), nullable=False))
    stdin_sha256: str | None = SQLField(default=None, sa_column=Column(String(64)))
    idempotency_key: str | None = SQLField(default=None, sa_column=Column(String))
    passed: int = SQLField(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    total: int = SQLField(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    score: float | None = SQLField(default=None, sa_column=Column(Float))
    error_code: str | None = SQLField(default=None, sa_column=Column(String))
    error_message: str | None = SQLField(default=None, sa_column=Column(Text))
    started_at: datetime | None = SQLField(default=None, sa_column=Column(DateTime(timezone=True)))
    finished_at: datetime | None = SQLField(default=None, sa_column=Column(DateTime(timezone=True)))
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class CodeRunCase(SQLModelStrictBaseModel, table=True):
    """One Judge0 submission result inside a code run."""

    __tablename__ = "code_run_case"
    __table_args__ = (
        Index("ix_code_run_case_run", "run_uuid"),
        Index("ix_code_run_case_test", "run_uuid", "test_id"),
    )

    id: int | None = SQLField(default=None, primary_key=True)
    run_uuid: str = SQLField(sa_column=Column(String, nullable=False))
    test_id: str = SQLField(sa_column=Column(String, nullable=False))
    judge0_token: str | None = SQLField(default=None, sa_column=Column(String))
    stdin: str | None = SQLField(default=None, sa_column=Column(Text))
    expected_output: str | None = SQLField(default=None, sa_column=Column(Text))
    description: str = SQLField(default="", sa_column=Column(Text, nullable=False, server_default=""))
    weight: float = SQLField(default=1.0, sa_column=Column(Float, nullable=False, server_default="1"))
    is_visible: bool = SQLField(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default="true"),
    )
    status_id: int | None = SQLField(default=None, sa_column=Column(Integer))
    status_description: str = SQLField(default="", sa_column=Column(String, nullable=False, server_default=""))
    passed: bool = SQLField(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    stdout: str | None = SQLField(default=None, sa_column=Column(Text))
    stderr: str | None = SQLField(default=None, sa_column=Column(Text))
    compile_output: str | None = SQLField(default=None, sa_column=Column(Text))
    message: str | None = SQLField(default=None, sa_column=Column(Text))
    time_seconds: float | None = SQLField(default=None, sa_column=Column(Float))
    memory_kb: int | None = SQLField(default=None, sa_column=Column(Integer))
