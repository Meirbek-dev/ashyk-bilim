"""Auth rewrite: rename password->hashed_password, add fastapi-users fields

Revision ID: f1a2b3c4d5e6
Revises: c72bd6adabed
Create Date: 2026-04-25 00:00:00.000000

Changes:
  - Rename password -> hashed_password column
  - Add is_active boolean column (NOT NULL, default True)
  - Add is_superuser boolean column (NOT NULL, default False)
  - Add is_verified boolean column (NOT NULL, default False)
"""

import sqlalchemy as sa
from alembic import op

revision = "f1a2b3c4d5e6"
down_revision = "c72bd6adabed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Rename password -> hashed_password ────────────────────────────────
    op.alter_column("user", "password", new_column_name="hashed_password")

    # ── 2. Add is_active (backfill True, then constrain) ─────────────────────
    op.add_column(
        "user",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("TRUE"),
        ),
    )
    op.execute('UPDATE "user" SET is_active = TRUE WHERE is_active IS NULL')
    op.alter_column("user", "is_active", nullable=False, server_default=None)

    # ── 3. Add is_superuser ───────────────────────────────────────────────────
    op.add_column(
        "user",
        sa.Column(
            "is_superuser",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("FALSE"),
        ),
    )
    op.execute('UPDATE "user" SET is_superuser = FALSE WHERE is_superuser IS NULL')
    op.alter_column("user", "is_superuser", nullable=False, server_default=None)

    # ── 4. Add is_verified ────────────────────────────────────────────────────
    op.add_column(
        "user",
        sa.Column(
            "is_verified",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("FALSE"),
        ),
    )
    op.execute('UPDATE "user" SET is_verified = FALSE WHERE is_verified IS NULL')
    op.alter_column("user", "is_verified", nullable=False, server_default=None)


def downgrade() -> None:
    op.drop_column("user", "is_verified")
    op.drop_column("user", "is_superuser")
    op.drop_column("user", "is_active")
    op.alter_column("user", "hashed_password", new_column_name="password")
