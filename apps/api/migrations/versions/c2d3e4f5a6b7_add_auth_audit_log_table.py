"""add auth audit log table

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-04-06 13:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())

    if "auth_audit_log" not in table_names:
        op.execute(
            sa.text(
                """
                CREATE TABLE IF NOT EXISTS auth_audit_log (
                    id SERIAL PRIMARY KEY,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    user_id TEXT NULL,
                    event_type TEXT NOT NULL,
                    session_id TEXT NULL,
                    ip_address TEXT NULL,
                    user_agent TEXT NULL,
                    metadata JSON NULL,
                    severity TEXT NOT NULL DEFAULT 'info'
                )
                """
            )
        )
    else:
        existing_columns = {
            column["name"]: column for column in inspector.get_columns("auth_audit_log")
        }

        if "created_at" not in existing_columns:
            op.execute(
                sa.text(
                    "ALTER TABLE auth_audit_log "
                    "ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT NOW()"
                )
            )
        else:
            op.execute(
                sa.text(
                    "ALTER TABLE auth_audit_log "
                    "ALTER COLUMN created_at SET DEFAULT NOW()"
                )
            )

        missing_columns = {
            "user_id": "TEXT NULL",
            "event_type": "TEXT",
            "session_id": "TEXT NULL",
            "ip_address": "TEXT NULL",
            "user_agent": "TEXT NULL",
            "metadata": "JSON NULL",
            "severity": "TEXT",
        }
        for column_name, column_type in missing_columns.items():
            if column_name not in existing_columns:
                default_clause = " DEFAULT 'info'" if column_name == "severity" else ""
                nullable_clause = (
                    " NOT NULL" if column_name in {"event_type", "severity"} else ""
                )
                op.execute(
                    sa.text(
                        "ALTER TABLE auth_audit_log "
                        f"ADD COLUMN {column_name} {column_type}{default_clause}{nullable_clause}"
                    )
                )

        op.execute(
            sa.text(
                "UPDATE auth_audit_log SET severity = 'info' WHERE severity IS NULL"
            )
        )
        op.execute(
            sa.text(
                "ALTER TABLE auth_audit_log ALTER COLUMN severity SET DEFAULT 'info'"
            )
        )
        op.execute(
            sa.text("ALTER TABLE auth_audit_log ALTER COLUMN severity SET NOT NULL")
        )

    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_auth_audit_log_user_id "
            "ON auth_audit_log (user_id)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_auth_audit_log_event_type "
            "ON auth_audit_log (event_type)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS auth_audit_log"))
