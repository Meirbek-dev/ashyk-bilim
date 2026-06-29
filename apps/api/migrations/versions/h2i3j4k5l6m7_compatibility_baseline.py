"""Compatibility baseline for the pre-April production migration head.

Revision ID: h2i3j4k5l6m7
Revises: None
Create Date: 2026-06-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlmodel import SQLModel

from src.db.model_registry import import_orm_models

revision: str = "h2i3j4k5l6m7"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_POST_BASELINE_TABLES = {
    "activity_progress",
    "analytics_saved_view",
    "assessment",
    "assessment_access_policy",
    "assessment_access_user",
    "assessment_access_usergroup",
    "assessment_item",
    "assessment_policy",
    "audit_event",
    "auth_audit_log",
    "auth_sessions",
    "bulk_action",
    "code_run",
    "code_run_case",
    "course_progress",
    "file_submission_activity",
    "file_submission_attempt",
    "file_submission_attempt_file",
    "grading_entry",
    "item_feedback",
    "student_policy_override",
    "submission",
    "teacher_intervention",
    "upload",
}


def upgrade() -> None:
    bind = op.get_bind()
    import_orm_models()

    baseline_tables = [
        table
        for table_name, table in SQLModel.metadata.tables.items()
        if table_name not in _POST_BASELINE_TABLES
    ]
    SQLModel.metadata.create_all(bind=bind, tables=baseline_tables, checkfirst=True)
    _create_legacy_submission_table(bind)


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DROP TABLE IF EXISTS submission CASCADE"))

    import_orm_models()
    baseline_tables = [
        table
        for table_name, table in reversed(SQLModel.metadata.tables.items())
        if table_name not in _POST_BASELINE_TABLES
    ]
    SQLModel.metadata.drop_all(bind=bind, tables=baseline_tables, checkfirst=True)


def _create_legacy_submission_table(bind: sa.Connection) -> None:
    bind.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS submission (
                id SERIAL PRIMARY KEY,
                submission_uuid VARCHAR NOT NULL,
                assessment_type VARCHAR NOT NULL,
                activity_id INTEGER NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                auto_score DOUBLE PRECISION NULL,
                final_score DOUBLE PRECISION NULL,
                status VARCHAR NOT NULL DEFAULT 'DRAFT',
                attempt_number INTEGER NOT NULL DEFAULT 1,
                is_late BOOLEAN NOT NULL DEFAULT FALSE,
                answers_json JSON NULL,
                grading_json JSON NULL,
                metadata_json JSON NULL,
                started_at TIMESTAMPTZ NULL,
                submitted_at TIMESTAMPTZ NULL,
                graded_at TIMESTAMPTZ NULL,
                created_at TIMESTAMPTZ NULL,
                updated_at TIMESTAMPTZ NULL,
                grading_version INTEGER NOT NULL DEFAULT 1
            )
            """
        )
    )
    bind.execute(sa.text("CREATE UNIQUE INDEX IF NOT EXISTS ix_submission_uuid ON submission (submission_uuid)"))
    bind.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_submission_user_activity ON submission (user_id, activity_id)"))
    bind.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_submission_activity_status_submitted "
            "ON submission (activity_id, status, submitted_at)"
        )
    )
    bind.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_submission_activity_status_late "
            "ON submission (activity_id, status, is_late)"
        )
    )
    bind.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS idx_submission_activity_user_status "
            "ON submission (activity_id, user_id, status)"
        )
    )
