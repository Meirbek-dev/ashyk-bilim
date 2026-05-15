"""Add first-class file submission activities.

Revision ID: 9c1f2a3b4d5e
Revises: 7b6a5c4d3e2f
Create Date: 2026-05-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9c1f2a3b4d5e"
down_revision: str | None = "7b6a5c4d3e2f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    _add_enum_value("activitytypeenum", "TYPE_FILE_SUBMISSION")
    _add_enum_value("activitysubtypeenum", "SUBTYPE_FILE_SUBMISSION_STANDARD")

    op.create_table(
        "file_submission_activity",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("file_submission_uuid", sa.String(), nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=False),
        sa.Column("instructions", sa.String(), nullable=False),
        sa.Column("rubric_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("allowed_mime_types", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("max_files", sa.Integer(), server_default="1", nullable=False),
        sa.Column("max_file_size_mb", sa.Integer(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("allow_late", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "late_policy_json",
            sa.JSON(),
            server_default='{"kind":"NONE"}',
            nullable=False,
        ),
        sa.Column("max_attempts", sa.Integer(), nullable=True),
        sa.Column(
            "grade_release_mode",
            sa.String(),
            server_default="IMMEDIATE",
            nullable=False,
        ),
        sa.Column("lifecycle", sa.String(), server_default="DRAFT", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("settings_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["activity_id"], ["activity.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_id", name="uq_file_submission_activity_id"),
        sa.UniqueConstraint(
            "file_submission_uuid", name="uq_file_submission_activity_uuid"
        ),
    )
    op.create_index(
        "ix_file_submission_activity_uuid",
        "file_submission_activity",
        ["file_submission_uuid"],
    )
    op.create_index(
        "ix_file_submission_activity_lifecycle",
        "file_submission_activity",
        ["lifecycle"],
    )

    op.create_table(
        "file_submission_attempt",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("attempt_uuid", sa.String(), nullable=False),
        sa.Column("file_submission_id", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), server_default="DRAFT", nullable=False),
        sa.Column("attempt_number", sa.Integer(), server_default="1", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("graded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_late", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("late_penalty_pct", sa.Float(), server_default="0", nullable=False),
        sa.Column("final_score", sa.Float(), nullable=True),
        sa.Column("feedback_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["activity_id"], ["activity.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["file_submission_id"], ["file_submission_activity.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("attempt_uuid", name="uq_file_submission_attempt_uuid"),
    )
    op.create_index(
        "ix_file_submission_attempt_activity_user",
        "file_submission_attempt",
        ["activity_id", "user_id"],
    )
    op.create_index(
        "ix_file_submission_attempt_submission",
        "file_submission_attempt",
        ["file_submission_id", "status"],
    )

    op.create_table(
        "file_submission_attempt_file",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("attempt_file_uuid", sa.String(), nullable=False),
        sa.Column("attempt_id", sa.Integer(), nullable=False),
        sa.Column("upload_id", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(), nullable=True),
        sa.Column("storage_key", sa.String(), nullable=True),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("scan_status", sa.String(), server_default="PENDING", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"], ["file_submission_attempt.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["upload_id"], ["upload.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("attempt_file_uuid", name="uq_file_submission_file_uuid"),
        sa.UniqueConstraint(
            "attempt_id", "upload_id", name="uq_file_submission_upload"
        ),
    )
    op.create_index(
        "ix_file_submission_file_attempt",
        "file_submission_attempt_file",
        ["attempt_id", "position"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_file_submission_file_attempt", table_name="file_submission_attempt_file"
    )
    op.drop_table("file_submission_attempt_file")
    op.drop_index(
        "ix_file_submission_attempt_submission", table_name="file_submission_attempt"
    )
    op.drop_index(
        "ix_file_submission_attempt_activity_user", table_name="file_submission_attempt"
    )
    op.drop_table("file_submission_attempt")
    op.drop_index(
        "ix_file_submission_activity_lifecycle", table_name="file_submission_activity"
    )
    op.drop_index(
        "ix_file_submission_activity_uuid", table_name="file_submission_activity"
    )
    op.drop_table("file_submission_activity")


def _add_enum_value(enum_name: str, value: str) -> None:
    op.execute(
        sa.text(
            f"""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '{enum_name}') THEN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_enum e
                        JOIN pg_type t ON t.oid = e.enumtypid
                        WHERE t.typname = '{enum_name}' AND e.enumlabel = '{value}'
                    ) THEN
                        ALTER TYPE {enum_name} ADD VALUE '{value}';
                    END IF;
                END IF;
            END
            $$;
            """
        )
    )
