"""Add analytics saved views

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-04-26

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "v2w3x4y5z6a7"
down_revision: str | None = "u1v2w3x4y5z6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "analytics_saved_view",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("teacher_user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("view_type", sa.String(), nullable=False, server_default="overview"),
        sa.Column("query", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_analytics_saved_view_teacher_user_id",
        "analytics_saved_view",
        ["teacher_user_id"],
    )
    op.create_index(
        "ix_analytics_saved_view_view_type",
        "analytics_saved_view",
        ["view_type"],
    )
    op.create_index(
        "ix_analytics_saved_view_lookup",
        "analytics_saved_view",
        ["teacher_user_id", "view_type", "name"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_analytics_saved_view_lookup", table_name="analytics_saved_view")
    op.drop_index("ix_analytics_saved_view_view_type", table_name="analytics_saved_view")
    op.drop_index("ix_analytics_saved_view_teacher_user_id", table_name="analytics_saved_view")
    op.drop_table("analytics_saved_view")
