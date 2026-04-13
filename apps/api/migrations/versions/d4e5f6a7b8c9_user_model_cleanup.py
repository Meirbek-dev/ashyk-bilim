"""User model cleanup: datetime fields, auth_provider, email_verified_at

Revision ID: d4e5f6a7b8c9
Revises: c2d3e4f5a6b7
Create Date: 2026-04-10 00:00:00.000000

Changes:
  - Rename creation_date → created_at, update_date → updated_at (VARCHAR → TIMESTAMPTZ)
  - Add auth_provider column (default 'local')
  - Add google_sub column (nullable)
  - Add email_verified_at column (nullable TIMESTAMPTZ)
  - Make password column nullable (OAuth users have no local password)
  - Backfill user_uuid where empty
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "d4e5f6a7b8c9"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Add new timestamp columns ─────────────────────────────────────────
    op.add_column(
        "user",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.func.now(),
        ),
    )
    op.add_column(
        "user",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.func.now(),
        ),
    )

    # ── 2. Backfill timestamps from old string columns ───────────────────────
    # Try parsing existing string dates; fall back to now() if unparseable.
    op.execute(
        """
        UPDATE "user"
        SET created_at = CASE
            WHEN creation_date IS NOT NULL AND creation_date != ''
            THEN creation_date::timestamptz
            ELSE NOW()
        END,
        updated_at = CASE
            WHEN update_date IS NOT NULL AND update_date != ''
            THEN update_date::timestamptz
            ELSE NOW()
        END
        """
    )

    # Make non-nullable after backfill
    op.alter_column("user", "created_at", nullable=False)
    op.alter_column("user", "updated_at", nullable=False)

    # ── 3. Drop old string columns ───────────────────────────────────────────
    op.drop_column("user", "creation_date")
    op.drop_column("user", "update_date")

    # ── 4. Add auth_provider column ──────────────────────────────────────────
    op.add_column(
        "user",
        sa.Column(
            "auth_provider",
            sa.String(),
            nullable=False,
            server_default="local",
        ),
    )

    # ── 5. Add google_sub column ─────────────────────────────────────────────
    op.add_column(
        "user",
        sa.Column("google_sub", sa.String(), nullable=True),
    )

    # ── 6. Add email_verified_at column ──────────────────────────────────────
    op.add_column(
        "user",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── 7. Make password nullable ────────────────────────────────────────────
    op.alter_column(
        "user",
        "password",
        existing_type=sa.String(),
        nullable=True,
    )

    # ── 8. Backfill empty user_uuid ──────────────────────────────────────────
    op.execute(
        """
        UPDATE "user"
        SET user_uuid = 'user_' || replace(gen_random_uuid()::text, '-', '')
        WHERE user_uuid IS NULL OR user_uuid = ''
        """
    )

    # ── 9. Set auth_provider for existing OAuth users (password = '') ────────
    op.execute(
        """
        UPDATE "user"
        SET auth_provider = 'google', password = NULL
        WHERE password = '' OR password IS NULL
        """
    )


def downgrade() -> None:
    # Re-add old string columns
    op.add_column(
        "user",
        sa.Column("creation_date", sa.String(), nullable=True, server_default=""),
    )
    op.add_column(
        "user",
        sa.Column("update_date", sa.String(), nullable=True, server_default=""),
    )

    # Backfill old columns from new
    op.execute(
        """
        UPDATE "user"
        SET creation_date = created_at::text,
            update_date = updated_at::text
        """
    )

    # Drop new columns
    op.drop_column("user", "created_at")
    op.drop_column("user", "updated_at")
    op.drop_column("user", "auth_provider")
    op.drop_column("user", "google_sub")
    op.drop_column("user", "email_verified_at")

    # Make password non-nullable again
    op.alter_column(
        "user",
        "password",
        existing_type=sa.String(),
        nullable=False,
        server_default="",
    )
