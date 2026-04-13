"""Merge restored migration roots for course/activity fixes

Revision ID: t9u0v1w2x3y4
Revises: 2296542d7e47, s3t4u5v6w7x
Create Date: 2026-04-03
"""

from collections.abc import Sequence

revision: str = "t9u0v1w2x3y4"
down_revision: tuple[str, str] = ("2296542d7e47", "s3t4u5v6w7x")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
