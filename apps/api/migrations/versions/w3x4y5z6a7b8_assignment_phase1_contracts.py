"""Assignment phase 1 contracts

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-04-27 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "w3x4y5z6a7b8"
down_revision: str | None = "v2w3x4y5z6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _backfill_assignment_task_order() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT id, assignment_id
            FROM assignmenttask
            ORDER BY assignment_id, id
            """
        )
    ).mappings()

    counters: dict[int, int] = {}
    for row in rows:
        assignment_id = row["assignment_id"]
        order = counters.get(assignment_id, 0)
        conn.execute(
            sa.text(
                """
                UPDATE assignmenttask
                SET "order" = :order
                WHERE id = :id
                """
            ),
            {"order": order, "id": row["id"]},
        )
        counters[assignment_id] = order + 1


def upgrade() -> None:
    op.add_column(
        "assignment",
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column(
        "assignmenttask",
        sa.Column("order", sa.Integer(), server_default="0", nullable=True),
    )
    _backfill_assignment_task_order()
    op.alter_column(
        "assignmenttask",
        "order",
        existing_type=sa.Integer(),
        nullable=False,
        server_default="0",
    )

    op.create_index(
        "idx_assignment_activity_id",
        "assignment",
        ["activity_id"],
    )
    op.create_unique_constraint(
        "uq_assignmenttask_order",
        "assignmenttask",
        ["assignment_id", "order"],
    )
    op.create_unique_constraint(
        "uq_assignmenttask_assignment_uuid",
        "assignmenttask",
        ["assignment_id", "assignment_task_uuid"],
    )
    op.create_index(
        "idx_assignmenttask_assignment_order",
        "assignmenttask",
        ["assignment_id", "order"],
    )
    op.create_index(
        "idx_assignmenttask_activity_id",
        "assignmenttask",
        ["activity_id"],
    )

    op.create_index(
        "idx_submission_activity_status_submitted",
        "submission",
        ["activity_id", "status", "submitted_at"],
    )
    op.create_index(
        "idx_submission_activity_status_late",
        "submission",
        ["activity_id", "status", "is_late"],
    )
    op.create_index(
        "idx_submission_activity_user_status",
        "submission",
        ["activity_id", "user_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("idx_submission_activity_user_status", table_name="submission")
    op.drop_index("idx_submission_activity_status_late", table_name="submission")
    op.drop_index("idx_submission_activity_status_submitted", table_name="submission")

    op.drop_index("idx_assignmenttask_activity_id", table_name="assignmenttask")
    op.drop_index("idx_assignmenttask_assignment_order", table_name="assignmenttask")
    op.drop_constraint(
        "uq_assignmenttask_assignment_uuid",
        "assignmenttask",
        type_="unique",
    )
    op.drop_constraint("uq_assignmenttask_order", "assignmenttask", type_="unique")
    op.drop_index("idx_assignment_activity_id", table_name="assignment")

    op.drop_column("assignmenttask", "order")
    op.drop_column("assignment", "due_at")
