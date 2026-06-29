"""Add persisted assessment item metadata.

Revision ID: c4d5e6f7a8b9
Revises: b1c2d3e4f5a7
Create Date: 2026-05-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | None = "b1c2d3e4f5a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("assessment_item") as batch_op:
        batch_op.add_column(
            sa.Column(
                "metadata_json",
                sa.JSON(),
                nullable=False,
                server_default="{}",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("assessment_item") as batch_op:
        batch_op.drop_column("metadata_json")
