import asyncio
import hashlib
import logging

import sqlalchemy.exc
from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, MetaData, Table, Text, delete, select, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlmodel import Session

from config.config import get_settings
from src.infra.db.engine import get_bg_engine
from src.services.ai.cache_manager import get_ai_cache_manager
from src.services.ai.chunking import chunk_documents
from src.services.ai.embeddings import embed_texts
from src.services.ai.exceptions import RetrievalError
from src.services.ai.models import DocumentChunk, RetrievedChunk

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Table definition — mirrors the migration schema exactly.
# Importing Vector from pgvector.sqlalchemy registers the psycopg type codec
# via SQLAlchemy pool-connect event listeners, so no manual registration needed.
# ---------------------------------------------------------------------------

_metadata = MetaData()

_document_chunks = Table(
    "document_chunks",
    _metadata,
    Column("id", Text, primary_key=True),
    Column("collection_name", Text, nullable=False),
    Column("document", Text, nullable=False),
    Column("embedding", Vector(), nullable=False),
    Column("metadata", JSONB, nullable=False),
    Column(
        "inserted_at",
        TIMESTAMP(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _content_hash(documents: list[str]) -> str:
    normalized = sorted(
        " ".join(document.split()) for document in documents if document.strip()
    )
    return hashlib.sha256("||".join(normalized).encode()).hexdigest()


def _collection_name(name: str | None, content_hash: str) -> str:
    if name:
        return name
    return f"doc_collection_{content_hash[:16]}"


def _is_missing_document_chunks_table_error(exc: Exception) -> bool:
    return "document_chunks" in str(getattr(exc, "orig", exc))


# ---------------------------------------------------------------------------
# Sync DB operations (run via asyncio.to_thread)
# ---------------------------------------------------------------------------


def _sync_upsert_collection(
    collection_name: str,
    chunks: list[DocumentChunk],
    embeddings: list[list[float]],
) -> None:
    """Replace all chunks for *collection_name* with the given data."""
    engine = get_bg_engine()
    with Session(engine) as session:
        try:
            # Delete stale rows first so a full replacement is always clean.
            session.execute(
                delete(_document_chunks).where(
                    _document_chunks.c.collection_name == collection_name
                )
            )

            rows = [
                {
                    "id": chunk.id,
                    "collection_name": collection_name,
                    "document": chunk.document,
                    "embedding": embedding,
                    "metadata": chunk.metadata,
                }
                for chunk, embedding in zip(chunks, embeddings, strict=True)
            ]

            stmt = pg_insert(_document_chunks).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "collection_name": stmt.excluded.collection_name,
                    "document": stmt.excluded.document,
                    "embedding": stmt.excluded.embedding,
                    "metadata": stmt.excluded.metadata,
                    "inserted_at": text("now()"),
                },
            )
            session.execute(stmt)
            session.commit()
        except sqlalchemy.exc.ProgrammingError as exc:
            session.rollback()
            if _is_missing_document_chunks_table_error(exc):
                raise RetrievalError(
                    "Vector retrieval storage unavailable",
                    details={"reason": "document_chunks_table_missing"},
                ) from exc
            raise

    logger.info(
        "Upserted %d chunks into pgvector collection %s",
        len(chunks),
        collection_name,
    )


def _sync_query_collection(
    collection_name: str,
    query_embedding: list[float],
    top_k: int,
) -> list[RetrievedChunk]:
    """Return the top-k chunks ordered by cosine distance (ascending)."""
    engine = get_bg_engine()
    distance = _document_chunks.c.embedding.cosine_distance(query_embedding).label(
        "distance"
    )
    stmt = (
        select(
            _document_chunks.c.id,
            _document_chunks.c.document,
            _document_chunks.c.metadata,
            distance,
        )
        .where(_document_chunks.c.collection_name == collection_name)
        .order_by(distance)
        .limit(top_k)
    )
    with Session(engine) as session:
        try:
            rows = session.execute(stmt).fetchall()
        except sqlalchemy.exc.ProgrammingError as exc:
            session.rollback()
            if _is_missing_document_chunks_table_error(exc):
                raise RetrievalError(
                    "Vector retrieval storage unavailable",
                    details={"reason": "document_chunks_table_missing"},
                ) from exc
            raise

    return [
        RetrievedChunk(
            id=row.id,
            document=row.document,
            score=float(row.distance),
            metadata=row.metadata or {},
        )
        for row in rows
    ]


def delete_expired_chunks(retention_seconds: int) -> int:
    """Delete chunks older than *retention_seconds*.

    Returns the row count removed, or -1 if the table does not exist yet
    (migration pending).
    """
    engine = get_bg_engine()
    with Session(engine) as session:
        try:
            result = session.execute(
                delete(_document_chunks).where(
                    _document_chunks.c.inserted_at
                    < text(f"now() - interval '{retention_seconds} seconds'")
                )
            )
            session.commit()
            return result.rowcount
        except sqlalchemy.exc.ProgrammingError as exc:
            # Table doesn't exist yet — migration not yet applied.
            session.rollback()
            if _is_missing_document_chunks_table_error(exc):
                return -1
            raise


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def ensure_collection(
    *,
    documents: list[str],
    embedding_model_name: str,
    collection_name: str | None,
) -> str:
    if not documents:
        raise RetrievalError("No documents available for retrieval")

    get_settings().ai_config
    content_hash = _content_hash(documents)
    resolved_name = _collection_name(collection_name, content_hash)
    cache_key = f"{embedding_model_name}_{resolved_name}_{content_hash}"
    cache_manager = get_ai_cache_manager()
    cached_name = cache_manager.retrieval_cache.get(cache_key)
    if isinstance(cached_name, str):
        return cached_name

    chunks = await asyncio.to_thread(chunk_documents, documents, embedding_model_name)
    if not chunks:
        raise RetrievalError(
            "No valid chunks created from documents",
            details={"document_count": len(documents)},
        )

    embeddings = await embed_texts(
        [chunk.document for chunk in chunks],
        embedding_model_name,
    )
    if len(embeddings) != len(chunks):
        raise RetrievalError(
            "Embedding count did not match chunk count",
            details={"chunks": len(chunks), "embeddings": len(embeddings)},
        )

    await asyncio.to_thread(
        _sync_upsert_collection,
        resolved_name,
        chunks,
        embeddings,
    )

    cache_manager.retrieval_cache.set(cache_key, resolved_name)
    if collection_name:
        activity_uuid = collection_name.removeprefix("activity_")
        cache_manager.register_retrieval_cache_key(activity_uuid, cache_key)
    return resolved_name


async def retrieve_chunks(
    *,
    query: str,
    documents: list[str],
    embedding_model_name: str,
    collection_name: str | None,
) -> list[RetrievedChunk]:
    resolved_name = await ensure_collection(
        documents=documents,
        embedding_model_name=embedding_model_name,
        collection_name=collection_name,
    )

    query_embedding = await embed_texts([query], embedding_model_name)
    if not query_embedding:
        raise RetrievalError("Failed to create query embedding")

    settings = get_settings().ai_config
    retrieved = await asyncio.to_thread(
        _sync_query_collection,
        resolved_name,
        query_embedding[0],
        settings.retrieval_top_k,
    )

    logger.info(
        "Retrieved %d chunks from pgvector collection %s",
        len(retrieved),
        resolved_name,
    )
    return retrieved
