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


def upgrade() -> None:
    # ── assessment ──────────────────────────────────────────────────────────
    with op.batch_alter_table("assessment") as batch_op:
        batch_op.add_column(
            sa.Column(
                "content_version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            )
        )

    # ── assessment_policy ───────────────────────────────────────────────────
    with op.batch_alter_table("assessment_policy") as batch_op:
        batch_op.add_column(
            sa.Column(
                "policy_version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            )
        )

    # ── submission ──────────────────────────────────────────────────────────
    with op.batch_alter_table("submission") as batch_op:
        batch_op.add_column(
            sa.Column(
                "content_version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            )
        )
        batch_op.add_column(
            sa.Column(
                "policy_version",
                sa.Integer(),
                nullable=False,
                server_default="1",
            )
        )
        batch_op.add_column(
            sa.Column("items_snapshot", sa.JSON(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("policy_snapshot", sa.JSON(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("submission") as batch_op:
        batch_op.drop_column("policy_snapshot")
        batch_op.drop_column("items_snapshot")
        batch_op.drop_column("policy_version")
        batch_op.drop_column("content_version")

    with op.batch_alter_table("assessment_policy") as batch_op:
        batch_op.drop_column("policy_version")

    with op.batch_alter_table("assessment") as batch_op:
        batch_op.drop_column("content_version")
