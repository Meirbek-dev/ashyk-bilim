"""Purge legacy assignment rows from canonical assessment tables.

Revision ID: 7a8b9c0d1e2f
Revises: 6f7a8b9c0d1e
Create Date: 2026-05-18
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7a8b9c0d1e2f"
down_revision: str | None = "6f7a8b9c0d1e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    existing_tables = set(sa.inspect(conn).get_table_names())

    if {"activity_progress", "submission"}.issubset(existing_tables):
        conn.execute(
            sa.text(
                """
                UPDATE activity_progress
                SET latest_submission_id = NULL,
                    best_submission_id = NULL
                WHERE latest_submission_id IN (
                    SELECT id FROM submission WHERE assessment_type = 'ASSIGNMENT'
                )
                   OR best_submission_id IN (
                    SELECT id FROM submission WHERE assessment_type = 'ASSIGNMENT'
                )
                """
            )
        )

    if "submission" in existing_tables:
        conn.execute(
            sa.text("DELETE FROM submission WHERE assessment_type = 'ASSIGNMENT'")
        )

    if "assessment" in existing_tables:
        conn.execute(sa.text("DELETE FROM assessment WHERE kind = 'ASSIGNMENT'"))

    if "assessment_policy" in existing_tables:
        conn.execute(
            sa.text(
                "DELETE FROM assessment_policy WHERE assessment_type = 'ASSIGNMENT'"
            )
        )

    _assert_no_legacy_assignment_assessment_rows(conn, existing_tables)


def downgrade() -> None:
    pass


def _assert_no_legacy_assignment_assessment_rows(
    conn: sa.Connection,
    existing_tables: set[str],
) -> None:
    checks = (
        ("assessment_policy", "assessment_type"),
        ("assessment", "kind"),
        ("submission", "assessment_type"),
    )

    for table_name, column_name in checks:
        if table_name not in existing_tables:
            continue
        count = conn.execute(
            sa.text(
                f"SELECT COUNT(*) FROM {table_name} WHERE {column_name} = 'ASSIGNMENT'"
            )
        ).scalar_one()
        if count:
            msg = f"Legacy ASSIGNMENT rows remain in {table_name}: {count}"
            raise RuntimeError(msg)
