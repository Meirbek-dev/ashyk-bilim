"""Add durable client turn identifiers to AI Q&A messages."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f3a4b5c6d7e8"
down_revision: str | None = "e2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("ai_qa_message", sa.Column("client_turn_id", sa.String(), nullable=True))
    op.create_index(
        "idx_ai_qa_client_turn",
        "ai_qa_message",
        ["course_id", "user_id", "client_turn_id"],
        unique=True,
    )
    op.add_column("ai_course_analysis", sa.Column("content_hash", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_course_analysis", "content_hash")
    op.drop_index("idx_ai_qa_client_turn", table_name="ai_qa_message")
    op.drop_column("ai_qa_message", "client_turn_id")
