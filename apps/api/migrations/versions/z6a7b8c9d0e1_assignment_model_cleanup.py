"""Assignment model cleanup: drop due_date, rename timestamp columns.

Phase 1 of the assignment/task/activity system rewrite:
  - Drop ``assignment.due_date`` (use ``due_at`` only).
  - Rename ``assignment.creation_date`` → ``created_at`` (TIMESTAMPTZ).
  - Rename ``assignment.update_date``   → ``updated_at`` (TIMESTAMPTZ).
  - Rename ``assignmenttask.creation_date`` → ``created_at`` (TIMESTAMPTZ).
  - Rename ``assignmenttask.update_date``   → ``updated_at`` (TIMESTAMPTZ).

Revision ID: z6a7b8c9d0e1
Revises: y5z6a7b8c9d0
Create Date: 2026-04-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "z6a7b8c9d0e1"
down_revision: str | None = "y5z6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── assignment table ──────────────────────────────────────────────────────

    op.drop_column("assignment", "due_date")

    op.alter_column(
        "assignment",
        "creation_date",
        new_column_name="created_at",
        existing_type=sa.Text(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="creation_date::timestamptz",
        nullable=False,
    )
    op.alter_column(
        "assignment",
        "update_date",
        new_column_name="updated_at",
        existing_type=sa.Text(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="update_date::timestamptz",
        nullable=False,
    )

    # ── assignmenttask table ──────────────────────────────────────────────────

    op.alter_column(
        "assignmenttask",
        "creation_date",
        new_column_name="created_at",
        existing_type=sa.Text(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="creation_date::timestamptz",
        nullable=False,
    )
    op.alter_column(
        "assignmenttask",
        "update_date",
        new_column_name="updated_at",
        existing_type=sa.Text(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="update_date::timestamptz",
        nullable=False,
    )


def downgrade() -> None:
    # ── assignmenttask table ──────────────────────────────────────────────────

    op.alter_column(
        "assignmenttask",
        "updated_at",
        new_column_name="update_date",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.Text(),
        postgresql_using="updated_at::text",
        nullable=True,
    )
    op.alter_column(
        "assignmenttask",
        "created_at",
        new_column_name="creation_date",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.Text(),
        postgresql_using="created_at::text",
        nullable=True,
    )

    # ── assignment table ──────────────────────────────────────────────────────

    op.alter_column(
        "assignment",
        "updated_at",
        new_column_name="update_date",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.Text(),
        postgresql_using="updated_at::text",
        nullable=True,
    )
    op.alter_column(
        "assignment",
        "created_at",
        new_column_name="creation_date",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.Text(),
        postgresql_using="created_at::text",
        nullable=True,
    )

    op.add_column(
        "assignment",
        sa.Column("due_date", sa.Text(), nullable=True),
    )
