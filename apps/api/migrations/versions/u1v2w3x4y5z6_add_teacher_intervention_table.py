"""Add teacher intervention tracking

Revision ID: u1v2w3x4y5z6
Revises: m8b7c6d5e4f3
Create Date: 2026-04-26

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "u1v2w3x4y5z6"
down_revision: str | None = "m8b7c6d5e4f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "teacher_intervention",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("teacher_user_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("intervention_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="planned"),
        sa.Column("outcome", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("risk_score_before", sa.Numeric(6, 2), nullable=True),
        sa.Column("risk_score_after", sa.Numeric(6, 2), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
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
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_teacher_intervention_teacher_user_id",
        "teacher_intervention",
        ["teacher_user_id"],
    )
    op.create_index("ix_teacher_intervention_user_id", "teacher_intervention", ["user_id"])
    op.create_index("ix_teacher_intervention_course_id", "teacher_intervention", ["course_id"])
    op.create_index(
        "ix_teacher_intervention_lookup",
        "teacher_intervention",
        ["teacher_user_id", "course_id", "user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_teacher_intervention_lookup", table_name="teacher_intervention")
    op.drop_index("ix_teacher_intervention_course_id", table_name="teacher_intervention")
    op.drop_index("ix_teacher_intervention_user_id", table_name="teacher_intervention")
    op.drop_index("ix_teacher_intervention_teacher_user_id", table_name="teacher_intervention")
    op.drop_table("teacher_intervention")
