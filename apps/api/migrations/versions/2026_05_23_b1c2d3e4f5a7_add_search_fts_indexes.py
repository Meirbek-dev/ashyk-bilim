"""Add FTS indexes for platform search.

Revision ID: b1c2d3e4f5a7
Revises: a0b1c2d3e4f5
Create Date: 2026-05-23
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "b1c2d3e4f5a7"
down_revision = "a0b1c2d3e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_course_search_fts "
            "ON course USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(about, '') || ' ' || coalesce(learnings, '') || ' ' || coalesce(tags, '')));"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_collection_search_fts "
            "ON collection USING gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_search_fts "
            "ON \"user\" USING gin (to_tsvector('english', coalesce(username, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(bio, '')));"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_course_search_fts;")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_collection_search_fts;")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_user_search_fts;")