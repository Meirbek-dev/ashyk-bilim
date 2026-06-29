"""migrate legacy timestamp fields

Revision ID: 44e39d920b74
Revises: c4d5e6f7a8b9
Create Date: 2026-06-02 00:14:43.269080

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "44e39d920b74"
down_revision: str | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TIMESTAMP_COLUMNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("collection", ("creation_date", "update_date")),
    ("collectioncourse", ("creation_date", "update_date")),
    ("block", ("creation_date", "update_date")),
    ("courseupdate", ("creation_date", "update_date")),
    ("coursediscussion", ("creation_date", "update_date")),
    ("discussionlike", ("creation_date",)),
    ("discussiondislike", ("creation_date",)),
    ("platform", ("creation_date", "update_date")),
    ("resourceauthor", ("creation_date", "update_date")),
    ("trailrun", ("creation_date", "update_date")),
    ("trailstep", ("creation_date", "update_date")),
    ("trail", ("creation_date", "update_date")),
    ("usergroupresource", ("creation_date", "update_date")),
    ("usergroupuser", ("creation_date", "update_date")),
    ("usergroup", ("creation_date", "update_date")),
    ("certifications", ("creation_date", "update_date")),
    ("certificateuser", ("created_at", "updated_at")),
)


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    for table_name, column_names in TIMESTAMP_COLUMNS:
        for column_name in column_names:
            conn.execute(sa.text(f'ALTER TABLE "{table_name}" ALTER COLUMN "{column_name}" DROP DEFAULT'))
            conn.execute(
                sa.text(
                    f"""
                    UPDATE "{table_name}"
                    SET "{column_name}" = NOW()
                    WHERE "{column_name}" IS NULL OR trim("{column_name}"::text) = ''
                    """
                )
            )
            conn.execute(
                sa.text(
                    f"""
                    ALTER TABLE "{table_name}"
                        ALTER COLUMN "{column_name}" TYPE TIMESTAMPTZ
                            USING "{column_name}"::TIMESTAMPTZ,
                        ALTER COLUMN "{column_name}" SET DEFAULT NOW()
                    """
                )
            )


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()

    for table_name, column_names in TIMESTAMP_COLUMNS:
        for column_name in column_names:
            conn.execute(
                sa.text(
                    f"""
                    ALTER TABLE "{table_name}"
                        ALTER COLUMN "{column_name}" DROP DEFAULT,
                        ALTER COLUMN "{column_name}" TYPE TEXT
                            USING "{column_name}"::TEXT
                    """
                )
            )
