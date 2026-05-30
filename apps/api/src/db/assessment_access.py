"""Course-scoped assessment access allowlists."""

from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class AssessmentAccessMode(StrEnum):
    ALL_COURSE_LEARNERS = "ALL_COURSE_LEARNERS"
    RESTRICTED = "RESTRICTED"


class AssessmentAccessPolicy(SQLModelStrictBaseModel, table=True):
    """Access rule for one assessment, always scoped by course access first."""

    __tablename__ = "assessment_access_policy"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint("assessment_id", name="uq_assessment_access_policy_assessment"),
        Index("ix_assessment_access_policy_assessment_id", "assessment_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    assessment_id: int = Field(
        sa_column=Column(
            "assessment_id",
            ForeignKey("assessment.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    mode: AssessmentAccessMode = Field(
        default=AssessmentAccessMode.ALL_COURSE_LEARNERS,
        sa_column=Column(
            "mode",
            String,
            nullable=False,
            server_default=AssessmentAccessMode.ALL_COURSE_LEARNERS.value,
        ),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
            onupdate=func.now(),
        ),
    )


class AssessmentAccessUser(SQLModelStrictBaseModel, table=True):
    """Direct learner allowlist entry for a restricted assessment."""

    __tablename__ = "assessment_access_user"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint("policy_id", "user_id", name="uq_assessment_access_user_policy_user"),
        Index("ix_assessment_access_user_policy_id", "policy_id"),
        Index("ix_assessment_access_user_user_id", "user_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    policy_id: int = Field(
        sa_column=Column(
            "policy_id",
            ForeignKey("assessment_access_policy.id", ondelete="CASCADE"),
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
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )


class AssessmentAccessUserGroup(SQLModelStrictBaseModel, table=True):
    """Usergroup allowlist entry for a restricted assessment."""

    __tablename__ = "assessment_access_usergroup"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint(
            "policy_id",
            "usergroup_id",
            name="uq_assessment_access_usergroup_policy_group",
        ),
        Index("ix_assessment_access_usergroup_policy_id", "policy_id"),
        Index("ix_assessment_access_usergroup_usergroup_id", "usergroup_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    policy_id: int = Field(
        sa_column=Column(
            "policy_id",
            ForeignKey("assessment_access_policy.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    usergroup_id: int = Field(
        sa_column=Column(
            "usergroup_id",
            ForeignKey("usergroup.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
