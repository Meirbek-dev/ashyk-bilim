"""finalize email verification removal

Revision ID: c72bd6adabed
Revises: b84feb892d7a
Create Date: 2026-04-11 17:22:14.454786

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c72bd6adabed"
down_revision: str | None = "b84feb892d7a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    column_names = {column["name"] for column in inspector.get_columns("user")}

    with op.batch_alter_table("user") as batch_op:
        if "email_verified_at" in column_names:
            batch_op.drop_column("email_verified_at")
        if "email_verified" in column_names:
            batch_op.drop_column("email_verified")


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    column_names = {column["name"] for column in inspector.get_columns("user")}

    with op.batch_alter_table("user") as batch_op:
        if "email_verified" not in column_names:
            batch_op.add_column(
                sa.Column(
                    "email_verified",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("false"),
                )
            )
        if "email_verified_at" not in column_names:
            batch_op.add_column(
                sa.Column(
                    "email_verified_at", sa.DateTime(timezone=True), nullable=True
                )
            )
