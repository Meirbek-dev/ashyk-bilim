"""Enforce student-workflow modernization invariants.

Revision ID: 1a2b3c4d5e6f
Revises: 0d1e2f3a4b5c
Create Date: 2026-05-18
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "1a2b3c4d5e6f"
down_revision: str | None = "0d1e2f3a4b5c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEPRECATED_TABLES: tuple[str, ...] = (
    "assignment",
    "assignment_task",
    "assignmenttask",
    "assignmentusersubmission",
    "assignmenttasksubmission",
)

DEPRECATED_METADATA_KEYS: tuple[str, ...] = (
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
    _assert_no_deprecated_tables(conn)
    _assert_no_deprecated_activity_types(conn)
    _assert_no_deprecated_submission_metadata(conn)
    _assert_no_deprecated_foreign_keys(conn)
    _add_runtime_indexes(conn)


def downgrade() -> None:
    pass


def _assert_no_deprecated_tables(conn: sa.Connection) -> None:
    rows = conn.execute(
        sa.text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name IN :table_names
            ORDER BY table_name
            """
        ).bindparams(sa.bindparam("table_names", expanding=True)),
        {"table_names": DEPRECATED_TABLES},
    ).fetchall()
    if rows:
        names = ", ".join(row.table_name for row in rows)
        msg = f"Deprecated assignment tables still exist: {names}"
        raise RuntimeError(msg)


def _assert_no_deprecated_activity_types(conn: sa.Connection) -> None:
    if not _table_exists(conn, "activity"):
        return
    count = conn.execute(sa.text("SELECT COUNT(*) FROM activity WHERE activity_type = 'TYPE_ASSIGNMENT'")).scalar_one()
    if count:
        msg = f"Deprecated TYPE_ASSIGNMENT activities remain: {count}"
        raise RuntimeError(msg)


def _assert_no_deprecated_submission_metadata(conn: sa.Connection) -> None:
    if not _table_exists(conn, "submission"):
        return
    key_checks = " OR ".join(f"metadata_json::jsonb ? '{key}'" for key in DEPRECATED_METADATA_KEYS)
    count = conn.execute(
        sa.text("SELECT COUNT(*) FROM submission WHERE metadata_json IS NOT NULL AND (" + key_checks + ")")
    ).scalar_one()
    if count:
        msg = f"Deprecated assignment metadata remains in submission rows: {count}"
        raise RuntimeError(msg)


def _assert_no_deprecated_foreign_keys(conn: sa.Connection) -> None:
    rows = conn.execute(
        sa.text(
            """
            SELECT tc.constraint_name, tc.table_name, ccu.table_name AS referenced_table
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
             AND ccu.constraint_schema = tc.constraint_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = current_schema()
              AND ccu.table_name IN :table_names
            ORDER BY tc.table_name, tc.constraint_name
            """
        ).bindparams(sa.bindparam("table_names", expanding=True)),
        {"table_names": DEPRECATED_TABLES},
    ).fetchall()
    if rows:
        formatted = ", ".join(f"{row.table_name}.{row.constraint_name}->{row.referenced_table}" for row in rows)
        msg = f"Foreign keys still reference deprecated assignment tables: {formatted}"
        raise RuntimeError(msg)


def _add_runtime_indexes(conn: sa.Connection) -> None:
    statements = (
        "CREATE INDEX IF NOT EXISTS ix_activity_activity_uuid ON activity(activity_uuid)",
        'CREATE INDEX IF NOT EXISTS ix_activity_course_uuid_order ON activity(course_id, chapter_id, "order", id)',
        "CREATE INDEX IF NOT EXISTS ix_submission_user_activity_status_attempt ON submission(user_id, activity_id, status, attempt_number)",
        "CREATE INDEX IF NOT EXISTS ix_file_submission_attempt_user_activity_status_updated ON file_submission_attempt(user_id, activity_id, status, updated_at)",
    )
    existing_tables = set(sa.inspect(conn).get_table_names())
    for statement in statements:
        if _index_target_exists(statement, existing_tables):
            conn.execute(sa.text(statement))


def _index_target_exists(statement: str, existing_tables: set[str]) -> bool:
    table_name = statement.split(" ON ", 1)[1].split("(", 1)[0].strip().strip('"')
    return table_name in existing_tables


def _table_exists(conn: sa.Connection, table_name: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = current_schema()
                      AND table_name = :table_name
                )
                """
            ),
            {"table_name": table_name},
        ).scalar()
    )
