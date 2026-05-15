"""Drop legacy assignment and assignmenttask tables.

All submission data was migrated to the canonical assessment/submission tables in
the earlier migrations. This migration finalises the cleanup:

  1. Asserts zero rows in ``assignment`` and ``assignmenttask`` (data-safety guard).
  2. Drops ``assignmenttask`` (FK child) then ``assignment`` (FK parent).
  3. Strips legacy ``assignment_*`` keys from ``submission.metadata_json`` so the
     column no longer carries dead references.

``assignmentusersubmission`` and ``assignmenttasksubmission`` were already dropped
in migration ``y5z6a7b8c9d0``.

Revision ID: a1b2c3d4e5f7
Revises: z6a7b8c9d0e1
Create Date: 2026-05-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: str | None = "z6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Keys that may remain in submission.metadata_json from the legacy assignment
# pipeline.  They are meaningless once the source tables are gone.
_LEGACY_METADATA_KEYS: tuple[str, ...] = (
    "assignment_uuid",
    "assignment_id",
    "assignment_task_id",
    "assignment_task_uuid",
    "assignment_type",
    "legacy_assignment_id",
    "legacy_assignment_uuid",
)


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # ── 1. Data-safety guard: assert tables are empty before dropping ─────────
    for table_name in ("assignment", "assignmenttask"):
        if table_name not in existing_tables:
            continue
        row = conn.execute(
            sa.text(f"SELECT COUNT(*) AS cnt FROM {table_name}")
        ).scalar()
        if row and int(row) > 0:
            raise RuntimeError(
                f"Cannot drop '{table_name}': {row} rows remain. "
                "Ensure data migration is complete before running this migration."
            )

    # ── 2. Drop child table first (FK dependency) ────────────────────────────
    if "assignmenttask" in existing_tables:
        # Drop any remaining indexes / constraints before dropping the table.
        op.drop_index(
            "idx_assignmenttask_assignment_order",
            table_name="assignmenttask",
            if_exists=True,
        )
        op.drop_index(
            "idx_assignmenttask_activity_id",
            table_name="assignmenttask",
            if_exists=True,
        )
        try:
            op.drop_constraint(
                "uq_assignmenttask_order",
                "assignmenttask",
                type_="unique",
            )
        except Exception:  # constraint may not exist on all envs
            pass
        try:
            op.drop_constraint(
                "uq_assignmenttask_assignment_uuid",
                "assignmenttask",
                type_="unique",
            )
        except Exception:
            pass
        op.drop_table("assignmenttask")

    # ── 3. Drop parent table ─────────────────────────────────────────────────
    if "assignment" in existing_tables:
        op.drop_index(
            "idx_assignment_status",
            table_name="assignment",
            if_exists=True,
        )
        op.drop_index(
            "idx_assignment_activity_id",
            table_name="assignment",
            if_exists=True,
        )
        op.drop_table("assignment")

    # ── 4. Strip legacy keys from submission.metadata_json ───────────────────
    if _LEGACY_METADATA_KEYS:
        removal_expr = " ".join(f"- '{key}'" for key in _LEGACY_METADATA_KEYS)

        conn.execute(
            sa.text(
                "UPDATE submission "
                "SET metadata_json = (COALESCE(metadata_json, '{}'::json)::jsonb "
                + removal_expr
                + ")::json "
                "WHERE metadata_json IS NOT NULL"
            )
        )


def downgrade() -> None:
    # ── Recreate ``assignment`` parent table ─────────────────────────────────
    op.create_table(
        "assignment",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("assignment_uuid", sa.String(), nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=True),
        sa.Column("chapter_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default=sa.text("'DRAFT'"),
        ),
        sa.ForeignKeyConstraint(
            ["activity_id"],
            ["activity.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id"],
            ["chapter.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["course_id"],
            ["course.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assignment_uuid"),
    )
    op.create_index("idx_assignment_status", "assignment", ["status"], unique=False)
    op.create_index(
        "idx_assignment_activity_id", "assignment", ["activity_id"], unique=False
    )

    # ── Recreate ``assignmenttask`` child table ───────────────────────────────
    op.create_table(
        "assignmenttask",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("assignment_task_uuid", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("assignment_type", sa.String(), nullable=False),
        sa.Column(
            "max_grade_value", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("task_content", sa.JSON(), nullable=True),
        sa.Column("assignment_id", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(
            ["assignment_id"],
            ["assignment.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["activity_id"],
            ["activity.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "assignment_id",
            "assignment_task_uuid",
            name="uq_assignmenttask_assignment_uuid",
        ),
        sa.UniqueConstraint("assignment_id", "order", name="uq_assignmenttask_order"),
    )
    op.create_index(
        "idx_assignmenttask_assignment_order",
        "assignmenttask",
        ["assignment_id", "order"],
        unique=False,
    )
    op.create_index(
        "idx_assignmenttask_activity_id",
        "assignmenttask",
        ["activity_id"],
        unique=False,
    )
