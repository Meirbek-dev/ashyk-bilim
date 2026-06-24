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


def _cols(table: str) -> set[str]:
    """Return current column names for the given table."""
    return {col["name"] for col in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    existing = _cols("user")

    # ── 1. Add new timestamp columns (IF NOT EXISTS) ──────────────────────────
    if "created_at" not in existing:
        op.add_column(
            "user",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=sa.func.now(),
            ),
        )
    if "updated_at" not in existing:
        op.add_column(
            "user",
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=True,
                server_default=sa.func.now(),
            ),
        )

    # Refresh after potential adds
    existing = _cols("user")

    # ── 2. Backfill timestamps from old string columns ────────────────────────
    has_creation_date = "creation_date" in existing
    has_update_date = "update_date" in existing
    if has_creation_date or has_update_date:
        created_expr = (
            "CASE WHEN creation_date IS NOT NULL AND creation_date != '' "
            "THEN creation_date::timestamptz ELSE NOW() END"
            if has_creation_date
            else "NOW()"
        )
        updated_expr = (
            "CASE WHEN update_date IS NOT NULL AND update_date != '' "
            "THEN update_date::timestamptz ELSE NOW() END"
            if has_update_date
            else "NOW()"
        )
        op.execute(
            f'UPDATE "user" SET created_at = {created_expr}, updated_at = {updated_expr}'
        )
    else:
        op.execute(
            'UPDATE "user" SET created_at = NOW(), updated_at = NOW() '
            "WHERE created_at IS NULL OR updated_at IS NULL"
        )

    # Make non-nullable after backfill
    op.alter_column("user", "created_at", nullable=False)
    op.alter_column("user", "updated_at", nullable=False)

    # ── 3. Drop old string columns (IF EXISTS — safe on re-runs) ─────────────
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS creation_date')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS update_date')

    # Refresh again
    existing = _cols("user")

    # ── 4. Add auth_provider column ───────────────────────────────────────────
    if "auth_provider" not in existing:
        op.add_column(
            "user",
            sa.Column(
                "auth_provider",
                sa.String(),
                nullable=False,
                server_default="local",
            ),
        )

    # ── 5. Add google_sub column ──────────────────────────────────────────────
    if "google_sub" not in existing:
        op.add_column(
            "user",
            sa.Column("google_sub", sa.String(), nullable=True),
        )

    # ── 6. Add email_verified_at column ───────────────────────────────────────
    if "email_verified_at" not in existing:
        op.add_column(
            "user",
            sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        )

    # ── 7. Make password nullable (only if 'password' column still exists) ────
    if "password" in existing:
        op.alter_column(
            "user",
            "password",
            existing_type=sa.String(),
            nullable=True,
        )

    # ── 8. Backfill empty user_uuid ───────────────────────────────────────────
    op.execute(
        """
        UPDATE "user"
        SET user_uuid = 'user_' || replace(gen_random_uuid()::text, '-', '')
        WHERE user_uuid IS NULL OR user_uuid = ''
        """
    )

    # ── 9. Set auth_provider for existing OAuth users (password = '') ─────────
    op.execute(
        """
        UPDATE "user"
        SET auth_provider = 'google', password = NULL
        WHERE password = '' OR password IS NULL
        """
    )


def downgrade() -> None:
    existing = _cols("user")

    # Re-add old string columns
    if "creation_date" not in existing:
        op.add_column(
            "user",
            sa.Column("creation_date", sa.String(), nullable=True, server_default=""),
        )
    if "update_date" not in existing:
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
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS created_at')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS updated_at')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS auth_provider')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS google_sub')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS email_verified_at')

    # Make password non-nullable again
    op.alter_column(
        "user",
        "password",
        existing_type=sa.String(),
        nullable=False,
        server_default="",
    )
