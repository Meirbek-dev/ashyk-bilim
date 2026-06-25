"""Remove legacy quiz activity support.

This migration preserves inline quizzes by converting their backing activity
rows to ``TYPE_CUSTOM`` / ``SUBTYPE_CUSTOM``. Any remaining ``TYPE_QUIZ``
activities are legacy course-activity quizzes and are deleted along with their
cascading assessment and submission rows.

It also drops quiz-only legacy tables that are no longer read by the app.

Revision ID: b4c5d6e7f8a9
Revises: 3f7c1d8a9b2e
Create Date: 2026-05-15 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b4c5d6e7f8a9"
down_revision: str | None = "3f7c1d8a9b2e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


LEGACY_TABLES: tuple[str, ...] = (
    "quiz_attempt",
    "quiz_question_stat",
    "question",
)


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


def upgrade() -> None:
    conn = op.get_bind()

    if _table_exists(conn, "assessment"):
        op.execute(
            sa.text(
                """
                UPDATE activity
                SET activity_type = 'TYPE_CUSTOM',
                    activity_sub_type = 'SUBTYPE_CUSTOM'
                FROM assessment
                WHERE assessment.activity_id = activity.id
                  AND COALESCE(assessment.is_inline, false) IS TRUE
                  AND activity.activity_type::text = 'TYPE_QUIZ'
                """
            )
        )

    op.execute(
        sa.text(
            """
            DELETE FROM block
            WHERE block_type::text = 'BLOCK_QUIZ'
            """
        )
    )

    op.execute(
        sa.text(
            """
            DELETE FROM activity
            WHERE activity_type::text = 'TYPE_QUIZ'
            """
        )
    )

    for table_name in LEGACY_TABLES:
        if _table_exists(conn, table_name):
            op.execute(sa.text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))


def downgrade() -> None:
    pass
