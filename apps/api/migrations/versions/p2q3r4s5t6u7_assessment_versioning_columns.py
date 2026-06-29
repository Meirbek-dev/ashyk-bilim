"""Add versioning and snapshot columns for Phase 1-3 plan.

Adds:
- assessment.content_version  -- incremented on each item mutation
- assessment_policy.policy_version -- incremented on each policy patch
- submission.content_version  -- snapshot of assessment version at submit time
- submission.policy_version   -- snapshot of policy version at submit time
- submission.items_snapshot   -- JSON snapshot of items at submit time
- submission.policy_snapshot  -- JSON snapshot of policy at submit time

Revision ID: p2q3r4s5t6u7
Revises: 5d3a2896acff
Create Date: 2026-05-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "p2q3r4s5t6u7"
down_revision: str | None = "5d3a2896acff"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _cols(table: str) -> set[str]:
    return {col["name"] for col in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # ── assessment ──────────────────────────────────────────────────────────
    if "content_version" not in _cols("assessment"):
        op.add_column(
            "assessment",
            sa.Column(
                "content_version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            ),
        )

    # ── assessment_policy ───────────────────────────────────────────────────
    if "policy_version" not in _cols("assessment_policy"):
        op.add_column(
            "assessment_policy",
            sa.Column(
                "policy_version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            ),
        )

    # ── submission ──────────────────────────────────────────────────────────
    submission_cols = _cols("submission")
    if "content_version" not in submission_cols:
        op.add_column(
            "submission",
            sa.Column(
                "content_version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            ),
        )
    if "policy_version" not in submission_cols:
        op.add_column(
            "submission",
            sa.Column(
                "policy_version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            ),
        )
    if "items_snapshot" not in submission_cols:
        op.add_column("submission", sa.Column("items_snapshot", sa.JSON(), nullable=True))
    if "policy_snapshot" not in submission_cols:
        op.add_column("submission", sa.Column("policy_snapshot", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.execute("ALTER TABLE submission DROP COLUMN IF EXISTS policy_snapshot")
    op.execute("ALTER TABLE submission DROP COLUMN IF EXISTS items_snapshot")
    op.execute("ALTER TABLE submission DROP COLUMN IF EXISTS policy_version")
    op.execute("ALTER TABLE submission DROP COLUMN IF EXISTS content_version")
    op.execute("ALTER TABLE assessment_policy DROP COLUMN IF EXISTS policy_version")
    op.execute("ALTER TABLE assessment DROP COLUMN IF EXISTS content_version")
