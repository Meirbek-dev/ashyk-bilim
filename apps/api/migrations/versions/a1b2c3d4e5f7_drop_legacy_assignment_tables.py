"""Prepare legacy assignment tables for post-merge cleanup.

All submission data was migrated to the canonical assessment/submission tables in
the earlier migrations. This revision runs on the assignment-cleanup branch, but
the assessment branch still needs ``assignment`` and ``assignmenttask`` rows to
backfill canonical assessments and items before the branch merge. Therefore this
revision only strips dead submission metadata and leaves table removal to the
post-merge cleanup revisions.

Revision ID: a1b2c3d4e5f7
Revises: z6a7b8c9d0e1
Create Date: 2026-05-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: str | None = "z6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LEGACY_METADATA_KEYS: tuple[str, ...] = (
    "assignment_uuid",
    "assignment_id",
    "assignment_task_id",
    "assignment_task_uuid",
    "assignment_type",
    "legacy_assignment_id",
    "legacy_assignment_uuid",
)


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())
    submission_columns = (
        {column["name"] for column in inspector.get_columns("submission")} if "submission" in existing_tables else set()
    )

    if _LEGACY_METADATA_KEYS and "metadata_json" in submission_columns:
        removal_expr = " ".join(f"- '{key}'" for key in _LEGACY_METADATA_KEYS)
        conn.execute(
            sa.text(
                "UPDATE submission "
                "SET metadata_json = (COALESCE(metadata_json, '{}'::json)::jsonb " + removal_expr + ")::json "
                "WHERE metadata_json IS NOT NULL"
            )
        )


def downgrade() -> None:
    pass
