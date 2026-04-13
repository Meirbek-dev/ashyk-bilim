"""restore pgvector document_chunks table

Revision ID: e1f2a3b4c5d6
Revises: c72bd6adabed
Create Date: 2026-04-11 23:20:00.000000

"""

from collections.abc import Sequence

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: str | None = "c72bd6adabed"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_VECTOR_DIMS = 512


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute(f"""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id              TEXT        PRIMARY KEY,
            collection_name TEXT        NOT NULL,
            document        TEXT        NOT NULL,
            embedding       vector({_VECTOR_DIMS}) NOT NULL,
            metadata        JSONB       NOT NULL DEFAULT '{{}}',
            inserted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute(
        "CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx "
        "ON document_chunks USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS document_chunks_collection_name_idx "
        "ON document_chunks (collection_name)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS document_chunks_inserted_at_idx "
        "ON document_chunks (inserted_at)"
    )


def downgrade() -> None:
    op.drop_index(
        "document_chunks_collection_name_idx",
        table_name="document_chunks",
        if_exists=True,
    )
    op.drop_index(
        "document_chunks_embedding_hnsw_idx",
        table_name="document_chunks",
        if_exists=True,
    )
    op.drop_index(
        "document_chunks_inserted_at_idx", table_name="document_chunks", if_exists=True
    )
    op.execute("DROP TABLE IF EXISTS document_chunks")
