"""
StudentPolicyOverride — per-student exceptions to AssessmentPolicy limits.

A teacher can grant a specific student extra attempts, a deadline extension,
or an exemption from late penalties without changing the policy for the whole
class.  The override is looked up at submit time; the most recent active row
wins.

Columns
-------
max_attempts_override   If set, replaces AssessmentPolicy.max_attempts for
                        this student.  NULL means "use the policy default".
due_at_override         If set, replaces AssessmentPolicy.due_at for this
                        student.  NULL means "use the policy default".
waive_late_penalty      If True the late_penalty_pct will be 0 for this
                        student regardless of the policy's late_policy_json.
note                    Optional teacher note explaining the override.
expires_at              If set, the override is ignored after this timestamp.
                        NULL means "never expires".
"""

from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class StudentPolicyOverride(SQLModelStrictBaseModel, table=True):
    """Per-student exception to an AssessmentPolicy."""

    __tablename__ = "student_policy_override"
    __table_args__ = (
        UniqueConstraint(
            "policy_id",
            "user_id",
            name="uq_student_policy_override_policy_user",
        ),
        Index("ix_spo_policy_user", "policy_id", "user_id"),
        Index("ix_spo_user_id", "user_id"),
    )

    id: int | None = Field(default=None, primary_key=True)

    policy_id: int = Field(
        sa_column=Column(
            "policy_id",
            ForeignKey("assessment_policy.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    user_id: int = Field(
        sa_column=Column(
            "user_id",
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        )
    )

    # Optional overrides — NULL = use the policy default
    max_attempts_override: int | None = Field(
        default=None,
        sa_column=Column("max_attempts_override", Integer, nullable=True),
    )
    due_at_override: datetime | None = Field(
        default=None,
        sa_column=Column("due_at_override", DateTime(timezone=True), nullable=True),
    )
    waive_late_penalty: bool = Field(
        default=False,
        sa_column=Column(
            "waive_late_penalty", Boolean, nullable=False, server_default="false"
        ),
    )

    note: str = Field(
        default="",
        sa_column=Column("note", Text, nullable=False, server_default=""),
    )
    expires_at: datetime | None = Field(
        default=None,
        sa_column=Column("expires_at", DateTime(timezone=True), nullable=True),
    )

    granted_by: int | None = Field(
        default=None,
        sa_column=Column(
            "granted_by",
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column("created_at", DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column("updated_at", DateTime(timezone=True), nullable=False),
    )


class StudentPolicyOverrideRead(SQLModelStrictBaseModel):
    """API projection of a StudentPolicyOverride."""

    id: int
    policy_id: int
    user_id: int
    max_attempts_override: int | None = None
    due_at_override: datetime | None = None
    waive_late_penalty: bool
    note: str
    expires_at: datetime | None = None
    granted_by: int | None = None
    created_at: datetime
    updated_at: datetime
