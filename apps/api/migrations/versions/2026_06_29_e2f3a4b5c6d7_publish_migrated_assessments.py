"""Publish canonical assessments for already-published legacy activities.

Revision ID: e2f3a4b5c6d7
Revises: 2026_06_28_ai_adaptive_learning
Create Date: 2026-06-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e2f3a4b5c6d7"
down_revision: str | None = "2026_06_28_ai_adaptive_learning"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())
    if "assessment" not in existing_tables or "activity" not in existing_tables:
        return

    conn.execute(
        sa.text(
            """
            UPDATE assessment AS target
            SET lifecycle = 'PUBLISHED',
                published_at = COALESCE(
                    target.published_at,
                    NULLIF(activity.update_date::text, '')::timestamptz,
                    NULLIF(activity.creation_date::text, '')::timestamptz,
                    now()
                ),
                updated_at = now()
            FROM activity
            WHERE activity.id = target.activity_id
              AND activity.published IS TRUE
              AND target.lifecycle IN ('DRAFT', 'SCHEDULED')
              AND (
                    target.assessment_uuid LIKE 'assessment_exam_%'
                 OR target.assessment_uuid LIKE 'assessment_activity_%'
              )
            """
        )
    )


def downgrade() -> None:
    pass
