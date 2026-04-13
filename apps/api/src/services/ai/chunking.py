import hashlib
import logging
import re

import tiktoken

from config.config import get_settings
from src.services.ai.models import DocumentChunk

logger = logging.getLogger(__name__)

_ENCODING_CACHE: dict[str, tiktoken.Encoding] = {}


def _encoding_for_model(model_name: str) -> tiktoken.Encoding:
    encoding = _ENCODING_CACHE.get(model_name)
    if encoding is not None:
        return encoding

    try:
        encoding = tiktoken.encoding_for_model(model_name)
    except KeyError:
        encoding = tiktoken.get_encoding("cl100k_base")

    _ENCODING_CACHE[model_name] = encoding
    return encoding


def _normalize_text(text: str) -> str:
    normalized = re.sub(r"\n{3,}", "\n\n", text.strip())
    return re.sub(r"[ \t]+", " ", normalized)


def _sentence_split(text: str) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return [sentence.strip() for sentence in sentences if sentence.strip()]


def _token_count(text: str, encoding: tiktoken.Encoding) -> int:
    return len(encoding.encode(text))


def _token_window_chunks(
    text: str,
    *,
    encoding: tiktoken.Encoding,
    chunk_size: int,
    chunk_overlap: int,
) -> list[str]:
    token_ids = encoding.encode(text)
    if len(token_ids) <= chunk_size:
        return [text]

    step = max(1, chunk_size - chunk_overlap)
    chunks: list[str] = []
    for start in range(0, len(token_ids), step):
        window = token_ids[start : start + chunk_size]
        if not window:
            break
        decoded = encoding.decode(window).strip()
        if decoded:
            chunks.append(decoded)
        if start + chunk_size >= len(token_ids):
            break
    return chunks


def chunk_documents(documents: list[str], model_name: str) -> list[DocumentChunk]:
    settings = get_settings().ai_config
    encoding = _encoding_for_model(model_name)
    chunk_size = settings.chunk_size
    chunk_overlap = settings.chunk_overlap

    document_chunks: list[DocumentChunk] = []

    for source_index, original in enumerate(documents):
        normalized = _normalize_text(original)
        if not normalized:
            continue

        paragraphs = [part for part in normalized.split("\n\n") if part.strip()]
        packed_chunks: list[str] = []
        buffer: list[str] = []
        buffer_tokens = 0

        for paragraph in paragraphs:
            paragraph_tokens = _token_count(paragraph, encoding)
            if paragraph_tokens > chunk_size:
                if buffer:
                    packed_chunks.append("\n\n".join(buffer))
                    buffer = []
                    buffer_tokens = 0
                for sentence in _sentence_split(paragraph):
                    if _token_count(sentence, encoding) > chunk_size:
                        packed_chunks.extend(
                            _token_window_chunks(
                                sentence,
                                encoding=encoding,
                                chunk_size=chunk_size,
                                chunk_overlap=chunk_overlap,
                            )
                        )
                    else:
                        packed_chunks.append(sentence)
                continue

            if buffer and buffer_tokens + paragraph_tokens > chunk_size:
                packed_chunks.append("\n\n".join(buffer))
                buffer = [paragraph]
                buffer_tokens = paragraph_tokens
            else:
                buffer.append(paragraph)
                buffer_tokens += paragraph_tokens

        if buffer:
            packed_chunks.append("\n\n".join(buffer))

        finalized_chunks: list[str] = []
        for chunk in packed_chunks:
            finalized_chunks.extend(
                _token_window_chunks(
                    chunk,
                    encoding=encoding,
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                )
            )

        for chunk_index, chunk in enumerate(finalized_chunks):
            clean_chunk = chunk.strip()
            if not clean_chunk:
                continue
            chunk_hash = hashlib.sha1(
                f"{source_index}:{chunk_index}:{clean_chunk}".encode(),
                usedforsecurity=False,
            ).hexdigest()
            document_chunks.append(
                DocumentChunk(
                    id=chunk_hash,
                    document=clean_chunk,
                    source_index=source_index,
                    chunk_index=chunk_index,
                    token_count=_token_count(clean_chunk, encoding),
                    metadata={"source_index": source_index, "chunk_index": chunk_index},
                )
            )

    logger.info(
        "Chunked %d documents into %d chunks",
        len(documents),
        len(document_chunks),
    )
    return document_chunks
