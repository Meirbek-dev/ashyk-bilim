"""Merge file submission and cleanup heads.

Revision ID: 4e2d1c0b9a7f
Revises: 9c1f2a3b4d5e, f1c2d3e4a5b6
Create Date: 2026-05-15
"""

from collections.abc import Sequence

revision: str = "4e2d1c0b9a7f"
down_revision: str | tuple[str, str] | None = ("9c1f2a3b4d5e", "f1c2d3e4a5b6")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
