"""Drop assignment lifecycle compatibility columns.

Revision ID: n9o0p1q2r3s4
Revises: 47d4ef24c3d4
Create Date: 2026-05-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "n9o0p1q2r3s4"
down_revision: str | None = "47d4ef24c3d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_tables = set(inspector.get_table_names())
    if "assignment" not in existing_tables:
        return

    op.drop_index("idx_assignment_scheduled_publish_at", table_name="assignment")
    op.drop_column("assignment", "archived_at")
    op.drop_column("assignment", "published_at")
    op.drop_column("assignment", "scheduled_publish_at")
    op.drop_column("assignment", "published")


def downgrade() -> None:
    op.add_column(
        "assignment",
        sa.Column(
            "published",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "assignment",
        sa.Column("scheduled_publish_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "assignment",
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "assignment",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_assignment_scheduled_publish_at",
        "assignment",
        ["scheduled_publish_at"],
        unique=False,
    )
