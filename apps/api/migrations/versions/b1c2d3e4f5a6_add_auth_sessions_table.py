"""add auth sessions table

Revision ID: b1c2d3e4f5a6
Revises: 01298eb34544
Create Date: 2026-04-06 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "01298eb34544"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(255) NOT NULL,
                token_family_id VARCHAR(255) NOT NULL,
                user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                refresh_token_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                rotated_at TIMESTAMPTZ NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ NULL,
                last_seen_at TIMESTAMPTZ NULL,
                replaced_by_session_id VARCHAR(255) NULL,
                ip_address VARCHAR(255) NULL,
                user_agent TEXT NULL,
                device_name VARCHAR(255) NULL,
                CONSTRAINT uq_auth_sessions_session_id UNIQUE (session_id),
                CONSTRAINT uq_auth_sessions_refresh_token_hash UNIQUE (refresh_token_hash)
            )
            """
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_auth_sessions_session_id ON auth_sessions (session_id)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_auth_sessions_refresh_token_hash ON auth_sessions (refresh_token_hash)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_family_id ON auth_sessions (token_family_id)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS auth_sessions"))
