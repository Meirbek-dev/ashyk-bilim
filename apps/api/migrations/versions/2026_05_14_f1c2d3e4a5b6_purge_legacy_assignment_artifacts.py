"""Purge legacy assignment artifacts from remaining tables.

This is a final cleanup migration after the canonical assessment stack has been
fully backfilled. It retypes legacy TYPE_ASSIGNMENT activities to
TYPE_FILE_SUBMISSION, strips dead assignment metadata from submissions, and
drops any remaining legacy assignment tables so no legacy assignment internals
remain in the database.

Revision ID: f1c2d3e4a5b6
Revises: 3f7c1d8a9b2e
Create Date: 2026-05-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f1c2d3e4a5b6"
down_revision: str | None = "3f7c1d8a9b2e"
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
    "legacy_assignment_task_id",
    "legacy_assignment_task_uuid",
    "legacy_assignment_type",
)


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if "activity" in existing_tables:
        conn.execute(
            sa.text(
                """
                UPDATE activity
                SET activity_type = 'TYPE_FILE_SUBMISSION',
                    activity_sub_type = 'SUBTYPE_FILE_SUBMISSION_STANDARD'
                WHERE activity_type = 'TYPE_ASSIGNMENT'
                """
            )
        )

    if "submission" in existing_tables:
        removal_expr = " ".join(f"- '{key}'" for key in _LEGACY_METADATA_KEYS)
        conn.execute(
            sa.text(
                "UPDATE submission "
                "SET metadata_json = (COALESCE(metadata_json, '{}'::json)::jsonb "
                + removal_expr
                + ")::json "
                "WHERE metadata_json IS NOT NULL"
            )
        )

    for table_name in (
        "assignmenttasksubmission",
        "assignmentusersubmission",
        "assignmenttask",
        "assignment_task",
        "assignment",
    ):
        if table_name in existing_tables:
            op.execute(sa.text(f"DROP TABLE IF EXISTS {table_name} CASCADE"))


def downgrade() -> None:
    pass
