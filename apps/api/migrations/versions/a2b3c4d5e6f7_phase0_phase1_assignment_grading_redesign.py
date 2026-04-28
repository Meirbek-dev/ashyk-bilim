"""Phase 0 + Phase 1: Assignment lifecycle & grading redesign.

Changes
-------
assignment table
  - ADD COLUMN status       VARCHAR NOT NULL DEFAULT 'DRAFT'
      Backfilled: 'PUBLISHED' where published = true, else 'DRAFT'.
  - ADD COLUMN scheduled_publish_at  TIMESTAMPTZ
  - ADD COLUMN published_at          TIMESTAMPTZ
  - ADD COLUMN archived_at           TIMESTAMPTZ
  - ADD INDEX  idx_assignment_status
  - ADD INDEX  idx_assignment_scheduled_publish_at

submission table
  - ADD COLUMN late_penalty_pct  FLOAT   NOT NULL DEFAULT 0
  - ADD COLUMN version           INTEGER NOT NULL DEFAULT 1

grading_entry table  (new append-only ledger)
  - CREATE TABLE grading_entry (
        id              SERIAL PRIMARY KEY,
        entry_uuid      VARCHAR NOT NULL UNIQUE,
        submission_id   INTEGER NOT NULL REFERENCES submission(id) ON DELETE CASCADE,
        graded_by       INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
        raw_score       FLOAT   NOT NULL,
        penalty_pct     FLOAT   NOT NULL DEFAULT 0,
        final_score     FLOAT   NOT NULL,
        breakdown       JSONB   NOT NULL DEFAULT '{}',
        overall_feedback TEXT   NOT NULL DEFAULT '',
        grading_version INTEGER NOT NULL DEFAULT 1,
        created_at      TIMESTAMPTZ NOT NULL,
        published_at    TIMESTAMPTZ
    )

Revision ID: a2b3c4d5e6f7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── assignment: lifecycle columns ─────────────────────────────────────────

    op.add_column(
        "assignment",
        sa.Column(
            "status",
            sa.String,
            nullable=False,
            server_default="DRAFT",
        ),
    )
    # Backfill: rows that were published before this migration get PUBLISHED.
    op.execute(
        "UPDATE assignment SET status = CASE WHEN published = true "
        "THEN 'PUBLISHED' ELSE 'DRAFT' END"
    )

    op.add_column(
        "assignment",
        sa.Column("scheduled_publish_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "assignment",
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill published_at for already-published rows (use updated_at as proxy).
    op.execute(
        "UPDATE assignment SET published_at = updated_at "
        "WHERE status = 'PUBLISHED'"
    )

    op.add_column(
        "assignment",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index("idx_assignment_status", "assignment", ["status"])
    op.create_index(
        "idx_assignment_scheduled_publish_at",
        "assignment",
        ["scheduled_publish_at"],
    )

    # ── submission: optimistic-lock version + late penalty ────────────────────

    op.add_column(
        "submission",
        sa.Column(
            "late_penalty_pct",
            sa.Float,
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "submission",
        sa.Column(
            "version",
            sa.Integer,
            nullable=False,
            server_default="1",
        ),
    )

    # ── grading_entry: new append-only ledger ─────────────────────────────────

    op.create_table(
        "grading_entry",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("entry_uuid", sa.String, nullable=False, unique=True),
        sa.Column(
            "submission_id",
            sa.Integer,
            sa.ForeignKey("submission.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "graded_by",
            sa.Integer,
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("raw_score", sa.Float, nullable=False),
        sa.Column("penalty_pct", sa.Float, nullable=False, server_default="0"),
        sa.Column("final_score", sa.Float, nullable=False),
        sa.Column(
            "breakdown",
            sa.JSON,
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "overall_feedback",
            sa.Text,
            nullable=False,
            server_default="",
        ),
        sa.Column(
            "grading_version",
            sa.Integer,
            nullable=False,
            server_default="1",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_grading_entry_submission_id",
        "grading_entry",
        ["submission_id"],
    )
    op.create_index(
        "ix_grading_entry_submission_published",
        "grading_entry",
        ["submission_id", "published_at"],
    )


def downgrade() -> None:
    # ── grading_entry ─────────────────────────────────────────────────────────
    op.drop_index("ix_grading_entry_submission_published", table_name="grading_entry")
    op.drop_index("ix_grading_entry_submission_id", table_name="grading_entry")
    op.drop_table("grading_entry")

    # ── submission ────────────────────────────────────────────────────────────
    op.drop_column("submission", "version")
    op.drop_column("submission", "late_penalty_pct")

    # ── assignment ────────────────────────────────────────────────────────────
    op.drop_index("idx_assignment_scheduled_publish_at", table_name="assignment")
    op.drop_index("idx_assignment_status", table_name="assignment")
    op.drop_column("assignment", "archived_at")
    op.drop_column("assignment", "published_at")
    op.drop_column("assignment", "scheduled_publish_at")
    op.drop_column("assignment", "status")
