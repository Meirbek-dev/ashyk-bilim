"""Add performance indexes for submission and activity_progress hot paths.

Revision ID: 9c0d1e2f3b4a
Revises: 8b9c0d1e2f3a
Create Date: 2026-05-22

Two indexes address the most common slow-query patterns identified in the
teacher grading queue and progress reporting paths:

1. idx_submission_status_late  — covers cross-activity "pending" counts where
   no activity_id filter is present (dashboard overview, platform-wide stats).

2. idx_activity_progress_state — covers enrollment completion funnels that
   filter on `state = 'NOT_STARTED'` without a course_id or user_id constraint.

Both use CONCURRENTLY so they do not block reads or writes during creation in
production.  Alembic runs them as plain `execute()` calls because
`CREATE INDEX CONCURRENTLY` cannot be executed inside a transaction block.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "9c0d1e2f3b4a"
down_revision = "8b9c0d1e2f3a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submission_status_late "
            "ON submission (status, is_late);"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_progress_state "
            "ON activity_progress (state);"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_submission_status_late;")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_activity_progress_state;")
