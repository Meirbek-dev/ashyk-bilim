"""Merge assessment cleanup heads.

Revision ID: 0d1e2f3a4b5c
Revises: 4e2d1c0b9a7f, b4c5d6e7f8a9
Create Date: 2026-05-15 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

revision: str = "0d1e2f3a4b5c"
down_revision: str | tuple[str, str] | None = ("4e2d1c0b9a7f", "b4c5d6e7f8a9")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass