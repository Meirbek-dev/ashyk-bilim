"""Assessment modernization phase 0.

Adds:
  - assessment.inline_parent_activity_id (FK → activity.id)
  - assessment.is_inline (bool, default false)
  - submission.draft_version (int, default 1)
  - audit_event table
  - New indexes for search and inline quiz aggregation

Drops (IF EXISTS — idempotent):
  - exam_attempt, quiz_attempt, code_submission, assignmenttask, assignmenttasksubmission

Strips legacy_* keys from submission.metadata_json.

Revision ID: c8f2d4a91e6b
Revises: b7e2c9f5a341
Create Date: 2026-05-12 00:00:00.000000
"""

import json

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c8f2d4a91e6b"
down_revision: str | None = "b7e2c9f5a341"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New columns on assessment ─────────────────────────────────────────────
    op.add_column(
        "assessment",
        sa.Column(
            "inline_parent_activity_id",
            sa.Integer(),
            sa.ForeignKey("activity.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "assessment",
        sa.Column(
            "is_inline",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # ── New column on submission ──────────────────────────────────────────────
    op.add_column(
        "submission",
        sa.Column(
            "draft_version",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )

    # ── audit_event table ─────────────────────────────────────────────────────
    op.create_table(
        "audit_event",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_uuid", sa.String(), nullable=False),
        sa.Column(
            "actor_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("target_kind", sa.String(), nullable=False),
        sa.Column("target_uuid", sa.String(), nullable=False),
        sa.Column(
            "payload_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "idx_audit_event_uuid",
        "audit_event",
        ["event_uuid"],
        unique=True,
    )
    op.create_index(
        "idx_audit_event_target",
        "audit_event",
        ["target_kind", "target_uuid", sa.text("created_at DESC")],
    )
    op.create_index(
        "idx_audit_event_actor",
        "audit_event",
        ["actor_id", sa.text("created_at DESC")],
    )

    # ── New indexes ───────────────────────────────────────────────────────────
    op.create_index(
        "idx_assessment_inline_parent",
        "assessment",
        ["inline_parent_activity_id"],
        postgresql_where=sa.text("inline_parent_activity_id IS NOT NULL"),
    )

    # ── Drop legacy tables (idempotent) ───────────────────────────────────────
    for table in [
        "exam_attempt",
        "quiz_attempt",
        "code_submission",
        "assignmenttask",
        "assignmenttasksubmission",
    ]:
        op.execute(sa.text(f"DROP TABLE IF EXISTS {table} CASCADE"))

    # ── Strip legacy_* keys from submission.metadata_json ─────────────────────
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, metadata_json FROM submission "
            "WHERE metadata_json::text LIKE '%legacy_%'"
        )
    ).fetchall()

    legacy_keys = [
        "legacy_code_submission_id",
        "legacy_plagiarism_score",
        "legacy_assignment_type",
        "legacy_task_submission_uuid",
    ]

    for row in rows:
        metadata = row.metadata_json if isinstance(row.metadata_json, dict) else {}
        changed = False
        for key in legacy_keys:
            if key in metadata:
                del metadata[key]
                changed = True
        if changed:
            conn.execute(
                sa.text("UPDATE submission SET metadata_json = :meta WHERE id = :id"),
                {"meta": json.dumps(metadata), "id": row.id},
            )


def downgrade() -> None:
    # Drop new indexes
    op.drop_index("idx_assessment_inline_parent", table_name="assessment")
    op.drop_index("idx_audit_event_actor", table_name="audit_event")
    op.drop_index("idx_audit_event_target", table_name="audit_event")
    op.drop_index("idx_audit_event_uuid", table_name="audit_event")

    # Drop audit_event table
    op.drop_table("audit_event")

    # Drop new columns
    op.drop_column("submission", "draft_version")
    op.drop_column("assessment", "is_inline")
    op.drop_column("assessment", "inline_parent_activity_id")
