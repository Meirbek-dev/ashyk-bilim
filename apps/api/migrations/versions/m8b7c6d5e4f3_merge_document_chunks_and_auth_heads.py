"""Merge document_chunks and auth rewrite heads

Revision ID: m8b7c6d5e4f3
Revises: e1f2a3b4c5d6, f1a2b3c4d5e6
Create Date: 2026-04-25 14:52:00
"""

from collections.abc import Sequence

revision: str = "m8b7c6d5e4f3"
down_revision: tuple[str, str] = ("e1f2a3b4c5d6", "f1a2b3c4d5e6")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
