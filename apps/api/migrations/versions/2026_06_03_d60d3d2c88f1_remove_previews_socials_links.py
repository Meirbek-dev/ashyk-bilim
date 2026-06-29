"""remove previews socials links

Revision ID: d60d3d2c88f1
Revises: a07f0f626c04
Create Date: 2026-06-03 21:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d60d3d2c88f1"
down_revision: str | None = "a07f0f626c04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {col["name"] for col in inspector.get_columns("platform")}
    if "socials" in columns:
        op.drop_column("platform", "socials")
    if "links" in columns:
        op.drop_column("platform", "links")
    if "previews" in columns:
        op.drop_column("platform", "previews")


def downgrade() -> None:
    op.add_column(
        "platform",
        sa.Column(
            "socials",
            sa.JSON(),
            server_default=sa.text("'{}'::json"),
            nullable=True,
        ),
    )
    op.add_column(
        "platform",
        sa.Column(
            "links",
            sa.JSON(),
            server_default=sa.text("'{}'::json"),
            nullable=True,
        ),
    )
    op.add_column(
        "platform",
        sa.Column(
            "previews",
            sa.JSON(),
            server_default=sa.text("'{}'::json"),
            nullable=True,
        ),
    )
