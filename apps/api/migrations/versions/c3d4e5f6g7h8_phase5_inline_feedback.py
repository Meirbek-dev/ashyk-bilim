"""Phase 5: inline item feedback.

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-04-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6g7h8"
down_revision: str | None = "b2c3d4e5f6g7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "item_feedback",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("grading_entry_id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("item_ref", sa.String(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("max_score", sa.Float(), nullable=True),
        sa.Column(
            "annotation_type",
            sa.String(),
            nullable=False,
            server_default="TEXT",
        ),
        sa.Column("annotation_data_key", sa.String(), nullable=True),
        sa.Column("graded_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["grading_entry_id"],
            ["grading_entry.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            ["submission.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["assignmenttask.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["graded_by"],
            ["user.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_item_feedback_grading_entry_id",
        "item_feedback",
        ["grading_entry_id"],
        unique=False,
    )
    op.create_index(
        "ix_item_feedback_submission_item",
        "item_feedback",
        ["submission_id", "item_ref"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_item_feedback_submission_item", table_name="item_feedback")
    op.drop_index("ix_item_feedback_grading_entry_id", table_name="item_feedback")
    op.drop_table("item_feedback")
