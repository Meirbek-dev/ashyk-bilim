"""add code execution run tables

Revision ID: b7e2c9f5a341
Revises: 8cd5865dca47
Create Date: 2026-05-11 02:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7e2c9f5a341"
down_revision: str | None = "8cd5865dca47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "code_run",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_uuid", sa.String(), nullable=False),
        sa.Column("assessment_uuid", sa.String(), nullable=False),
        sa.Column("item_uuid", sa.String(), nullable=False),
        sa.Column("submission_uuid", sa.String(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("purpose", sa.String(), nullable=False),
        sa.Column("status", sa.String(), server_default="QUEUED", nullable=False),
        sa.Column("language_id", sa.Integer(), nullable=False),
        sa.Column("source_sha256", sa.String(length=64), nullable=False),
        sa.Column("stdin_sha256", sa.String(length=64), nullable=True),
        sa.Column("idempotency_key", sa.String(), nullable=True),
        sa.Column("passed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("total", sa.Integer(), server_default="0", nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("error_code", sa.String(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_code_run_uuid", "code_run", ["run_uuid"], unique=True)
    op.create_index(
        "ix_code_run_assessment_item",
        "code_run",
        ["assessment_uuid", "item_uuid"],
        unique=False,
    )
    op.create_index(
        "ix_code_run_user_item_purpose",
        "code_run",
        ["user_id", "item_uuid", "purpose"],
        unique=False,
    )
    op.create_index(
        "uq_code_run_idempotency",
        "code_run",
        ["user_id", "item_uuid", "purpose", "idempotency_key"],
        unique=True,
    )

    op.create_table(
        "code_run_case",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_uuid", sa.String(), nullable=False),
        sa.Column("test_id", sa.String(), nullable=False),
        sa.Column("judge0_token", sa.String(), nullable=True),
        sa.Column("stdin", sa.Text(), nullable=True),
        sa.Column("expected_output", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("weight", sa.Float(), server_default="1", nullable=False),
        sa.Column("is_visible", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("status_id", sa.Integer(), nullable=True),
        sa.Column("status_description", sa.String(), server_default="", nullable=False),
        sa.Column("passed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("stdout", sa.Text(), nullable=True),
        sa.Column("stderr", sa.Text(), nullable=True),
        sa.Column("compile_output", sa.Text(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("time_seconds", sa.Float(), nullable=True),
        sa.Column("memory_kb", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_code_run_case_run", "code_run_case", ["run_uuid"], unique=False)
    op.create_index(
        "ix_code_run_case_test",
        "code_run_case",
        ["run_uuid", "test_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_code_run_case_test", table_name="code_run_case")
    op.drop_index("ix_code_run_case_run", table_name="code_run_case")
    op.drop_table("code_run_case")
    op.drop_index("uq_code_run_idempotency", table_name="code_run")
    op.drop_index("ix_code_run_user_item_purpose", table_name="code_run")
    op.drop_index("ix_code_run_assessment_item", table_name="code_run")
    op.drop_index("ix_code_run_uuid", table_name="code_run")
    op.drop_table("code_run")
