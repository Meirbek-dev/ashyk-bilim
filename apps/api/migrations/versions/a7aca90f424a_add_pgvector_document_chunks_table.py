"""add pgvector document_chunks table

Revision ID: a7aca90f424a
Revises: t9u0v1w2x3y4
Create Date: 2026-04-03 22:40:54.999271

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7aca90f424a"
down_revision: str | None = "t9u0v1w2x3y4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Dimension must match PLATFORM_AI_EMBEDDING_DIMENSIONS (default 512).
# To change the dimension: drop and recreate the table with a new migration.
_VECTOR_DIMS = 512


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.execute(f"""
        CREATE TABLE document_chunks (
            id              TEXT        PRIMARY KEY,
            collection_name TEXT        NOT NULL,
            document        TEXT        NOT NULL,
            embedding       vector({_VECTOR_DIMS}) NOT NULL,
            metadata        JSONB       NOT NULL DEFAULT '{{}}',
            inserted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # HNSW index for approximate nearest-neighbour search with cosine distance.
    # m=16 / ef_construction=64 are safe defaults for collections of this size.
    op.execute("""
        CREATE INDEX document_chunks_embedding_hnsw_idx
        ON document_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    op.execute(
        "CREATE INDEX document_chunks_collection_name_idx "
        "ON document_chunks (collection_name)"
    )
    op.execute(
        "CREATE INDEX document_chunks_inserted_at_idx ON document_chunks (inserted_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS document_chunks")
