"""fix upload columns

Revision ID: 8cd5865dca47
Revises: p2q3r4s5t6u7
Create Date: 2026-05-11 00:00:27.817638

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8cd5865dca47"
down_revision: Union[str, None] = "p2q3r4s5t6u7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Rename columns to match the current SQLModel Upload definition
    op.alter_column("upload", "upload_id", new_column_name="upload_uuid")
    op.alter_column("upload", "size", new_column_name="size_bytes")
    op.alter_column("upload", "key", new_column_name="storage_key")

    # Add the missing referenced_count column
    op.add_column(
        "upload",
        sa.Column("referenced_count", sa.Integer(), nullable=False, server_default="0"),
    )

    # Update index to match the new column name
    op.drop_index("ix_upload_upload_id", table_name="upload")
    op.create_index("ix_upload_upload_uuid", "upload", ["upload_uuid"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    # Revert index
    op.drop_index("ix_upload_upload_uuid", table_name="upload")

    # Remove referenced_count
    op.drop_column("upload", "referenced_count")

    # Revert column renames
    op.alter_column("upload", "storage_key", new_column_name="key")
    op.alter_column("upload", "size_bytes", new_column_name="size")
    op.alter_column("upload", "upload_uuid", new_column_name="upload_id")

    # Re-create old index
    op.create_index("ix_upload_upload_id", "upload", ["upload_id"], unique=True)
