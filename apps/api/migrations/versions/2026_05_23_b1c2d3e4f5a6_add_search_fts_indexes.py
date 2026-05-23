"""Add FTS indexes for platform search.

Revision ID: b1c2d3e4f5a6
Revises: a0b1c2d3e4f5
Create Date: 2026-05-23
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "b1c2d3e4f5a6"
down_revision = "a0b1c2d3e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_course_search_fts "
            "ON course USING gin (to_tsvector('english', concat_ws(' ', name, description, about, learnings, tags)));"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_collection_search_fts "
            "ON collection USING gin (to_tsvector('english', concat_ws(' ', name, description)));"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_search_fts "
            "ON \"user\" USING gin (to_tsvector('english', concat_ws(' ', username, first_name, last_name, bio)));"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_course_search_fts;")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_collection_search_fts;")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_user_search_fts;")