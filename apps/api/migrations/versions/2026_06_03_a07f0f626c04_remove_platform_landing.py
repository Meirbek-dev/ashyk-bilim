"""remove platform landing

Revision ID: a07f0f626c04
Revises: 44e39d920b74
Create Date: 2026-06-03 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a07f0f626c04"
down_revision: str | None = "44e39d920b74"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = {col["name"] for col in inspector.get_columns("platform")}
    if "landing" in columns:
        op.drop_column("platform", "landing")


def downgrade() -> None:
    op.add_column(
        "platform",
        sa.Column(
            "landing",
            sa.JSON(),
            server_default=sa.text("'{}'::json"),
            nullable=True,
        ),
    )
