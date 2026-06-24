"""fix upload columns

Revision ID: 8cd5865dca47
Revises: p2q3r4s5t6u7
Create Date: 2026-05-11 00:00:27.817638

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8cd5865dca47"
down_revision: str | None = "p2q3r4s5t6u7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _cols(table: str) -> set[str]:
    return {col["name"] for col in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    """Upgrade schema."""
    upload_cols = _cols("upload")

    # Rename columns to match the current SQLModel Upload definition.
    # Guard each rename: only rename if the old name exists and new name doesn't.
    if "upload_id" in upload_cols and "upload_uuid" not in upload_cols:
        op.alter_column("upload", "upload_id", new_column_name="upload_uuid")
    if "size" in upload_cols and "size_bytes" not in upload_cols:
        op.alter_column("upload", "size", new_column_name="size_bytes")
    if "key" in upload_cols and "storage_key" not in upload_cols:
        op.alter_column("upload", "key", new_column_name="storage_key")

    # Add the missing referenced_count column (if not already present).
    if "referenced_count" not in upload_cols:
        op.add_column(
            "upload",
            sa.Column("referenced_count", sa.Integer(), nullable=False, server_default="0"),
        )

    # Update index to match the new column name.
    insp = sa.inspect(op.get_bind())
    existing_indexes = {idx["name"] for idx in insp.get_indexes("upload")}
    if "ix_upload_upload_id" in existing_indexes:
        op.drop_index("ix_upload_upload_id", table_name="upload")
    if "ix_upload_upload_uuid" not in existing_indexes:
        op.create_index("ix_upload_upload_uuid", "upload", ["upload_uuid"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    upload_cols = _cols("upload")
    insp = sa.inspect(op.get_bind())
    existing_indexes = {idx["name"] for idx in insp.get_indexes("upload")}

    # Revert index
    if "ix_upload_upload_uuid" in existing_indexes:
        op.drop_index("ix_upload_upload_uuid", table_name="upload")

    # Remove referenced_count
    if "referenced_count" in upload_cols:
        op.drop_column("upload", "referenced_count")

    # Revert column renames
    if "storage_key" in upload_cols and "key" not in upload_cols:
        op.alter_column("upload", "storage_key", new_column_name="key")
    if "size_bytes" in upload_cols and "size" not in upload_cols:
        op.alter_column("upload", "size_bytes", new_column_name="size")
    if "upload_uuid" in upload_cols and "upload_id" not in upload_cols:
        op.alter_column("upload", "upload_uuid", new_column_name="upload_id")

    # Re-create old index
    if "ix_upload_upload_id" not in existing_indexes:
        op.create_index("ix_upload_upload_id", "upload", ["upload_id"], unique=True)
