"""Fix course creation_date/update_date columns from VARCHAR/TIMESTRING to TIMESTAMPTZ

Revision ID: s3t4u5v6w7x
Revises: None
Create Date: 2026-03-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "s3t4u5v6w7x"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # Stage empty/NULL values to a valid timestamp before casting.
    conn.execute(
        sa.text(
            """
            UPDATE course
            SET creation_date = NOW()
            WHERE creation_date IS NULL OR trim(creation_date::text) = ''
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE course
            SET update_date = NOW()
            WHERE update_date IS NULL OR trim(update_date::text) = ''
            """
        )
    )

    # Convert existing string timestamps to TIMESTAMPTZ.
    conn.execute(
        sa.text(
            """
            ALTER TABLE course
                ALTER COLUMN creation_date TYPE TIMESTAMPTZ
                    USING creation_date::TIMESTAMPTZ,
                ALTER COLUMN update_date TYPE TIMESTAMPTZ
                    USING update_date::TIMESTAMPTZ
            """
        )
    )

    # Ensure new rows are persisted as timestamps in UTC.
    conn.execute(
        sa.text(
            """
            ALTER TABLE course
                ALTER COLUMN creation_date SET DEFAULT NOW(),
                ALTER COLUMN update_date SET DEFAULT NOW()
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()

    conn.execute(
        sa.text(
            """
            ALTER TABLE course
                ALTER COLUMN creation_date TYPE TEXT
                    USING creation_date::TEXT,
                ALTER COLUMN update_date TYPE TEXT
                    USING update_date::TEXT
            """
        )
    )

    conn.execute(
        sa.text(
            """
            ALTER TABLE course
                ALTER COLUMN creation_date DROP DEFAULT,
                ALTER COLUMN update_date DROP DEFAULT
            """
        )
    )
