"""Add course-scoped assessment access allowlists.

Revision ID: 8b9c0d1e2f3a
Revises: 7a8b9c0d1e2f
Create Date: 2026-05-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "8b9c0d1e2f3a"
down_revision: str | None = "7a8b9c0d1e2f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assessment_access_policy",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("assessment_id", sa.Integer(), nullable=False),
        sa.Column(
            "mode",
            sa.String(),
            server_default="ALL_COURSE_LEARNERS",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["assessment_id"], ["assessment.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assessment_id", name="uq_assessment_access_policy_assessment"),
    )
    op.create_index(
        "ix_assessment_access_policy_assessment_id",
        "assessment_access_policy",
        ["assessment_id"],
    )

    op.create_table(
        "assessment_access_user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("policy_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["policy_id"], ["assessment_access_policy.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("policy_id", "user_id", name="uq_assessment_access_user_policy_user"),
    )
    op.create_index("ix_assessment_access_user_policy_id", "assessment_access_user", ["policy_id"])
    op.create_index("ix_assessment_access_user_user_id", "assessment_access_user", ["user_id"])

    op.create_table(
        "assessment_access_usergroup",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("policy_id", sa.Integer(), nullable=False),
        sa.Column("usergroup_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["policy_id"], ["assessment_access_policy.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["usergroup_id"], ["usergroup.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "policy_id",
            "usergroup_id",
            name="uq_assessment_access_usergroup_policy_group",
        ),
    )
    op.create_index(
        "ix_assessment_access_usergroup_policy_id",
        "assessment_access_usergroup",
        ["policy_id"],
    )
    op.create_index(
        "ix_assessment_access_usergroup_usergroup_id",
        "assessment_access_usergroup",
        ["usergroup_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_assessment_access_usergroup_usergroup_id",
        table_name="assessment_access_usergroup",
    )
    op.drop_index(
        "ix_assessment_access_usergroup_policy_id",
        table_name="assessment_access_usergroup",
    )
    op.drop_table("assessment_access_usergroup")
    op.drop_index("ix_assessment_access_user_user_id", table_name="assessment_access_user")
    op.drop_index("ix_assessment_access_user_policy_id", table_name="assessment_access_user")
    op.drop_table("assessment_access_user")
    op.drop_index(
        "ix_assessment_access_policy_assessment_id",
        table_name="assessment_access_policy",
    )
    op.drop_table("assessment_access_policy")
