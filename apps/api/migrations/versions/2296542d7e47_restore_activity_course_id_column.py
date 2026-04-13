"""Restore activity.course_id column

The previous migration (l6m7n8o9p0q) dropped this column prematurely.
It is still referenced by analytics, payments, trail, exams, blocks, and
certifications services, so it must be kept as a denormalised FK.

Revision ID: 2296542d7e47
Revises: None
Create Date: 2026-03-24

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2296542d7e47"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # Re-add the column (nullable, no FK enforcement to avoid lock issues)
    conn.execute(
        sa.text("ALTER TABLE activity ADD COLUMN IF NOT EXISTS course_id INTEGER")
    )

    # Backfill from chapter.course_id
    conn.execute(
        sa.text(
            """
            UPDATE activity a
            SET course_id = c.course_id
            FROM chapter c
            WHERE a.chapter_id = c.id
              AND a.course_id IS NULL
            """
        )
    )

    # Add FK constraint (nullable, SET NULL on course delete)
    conn.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'activity'::regclass
                      AND conname = 'activity_course_id_fkey'
                ) THEN
                    ALTER TABLE activity
                        ADD CONSTRAINT activity_course_id_fkey
                        FOREIGN KEY (course_id) REFERENCES course(id)
                        ON DELETE SET NULL;
                END IF;
            END $$;
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'activity'::regclass
                      AND conname = 'activity_course_id_fkey'
                ) THEN
                    ALTER TABLE activity DROP CONSTRAINT activity_course_id_fkey;
                END IF;
            END $$;
            """
        )
    )

    conn.execute(sa.text("ALTER TABLE activity DROP COLUMN IF EXISTS course_id"))
