import hashlib
import logging
import re

from tokenizers import Tokenizer

from config.config import get_settings
from src.services.ai.models import DocumentChunk

logger = logging.getLogger(__name__)

_TOKENIZER_CACHE: dict[str, Tokenizer] = {}


def _tokenizer_for_model(model_name: str) -> Tokenizer:
    tokenizer = _TOKENIZER_CACHE.get(model_name)
    if tokenizer is not None:
        return tokenizer

    try:
        # Fetches tokenizer configuration from the Hugging Face hub
        tokenizer = Tokenizer.from_pretrained(model_name)
    except Exception:
        logger.warning("Tokenizer %s not found. Falling back to gpt2", model_name)
        # gpt2 is a standard BPE fallback similar to cl100k_base
        tokenizer = Tokenizer.from_pretrained("gpt2")

    _TOKENIZER_CACHE[model_name] = tokenizer
    return tokenizer


def _normalize_text(text: str) -> str:
    normalized = re.sub(r"\n{3,}", "\n\n", text.strip())
    return re.sub(r"[ \t]+", " ", normalized)


def _sentence_split(text: str) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return [sentence.strip() for sentence in sentences if sentence.strip()]


def _token_count(text: str, tokenizer: Tokenizer) -> int:
    # tokenizers.Tokenizer.encode does not accept add_special_tokens=False
    return len(tokenizer.encode(text).ids)


def _token_window_chunks(
    text: str,
    *,
    tokenizer: Tokenizer,
    chunk_size: int,
    chunk_overlap: int,
) -> list[str]:
    token_ids = tokenizer.encode(text).ids
    if len(token_ids) <= chunk_size:
        return [text]

    step = max(1, chunk_size - chunk_overlap)
    chunks: list[str] = []

    for start in range(0, len(token_ids), step):
        window = token_ids[start : start + chunk_size]
        if not window:
            break

        decoded = tokenizer.decode(window).strip()
        if decoded:
            chunks.append(decoded)

        if start + chunk_size >= len(token_ids):
            break

    return chunks


def chunk_documents(documents: list[str], model_name: str) -> list[DocumentChunk]:
    settings = get_settings().ai_config
    tokenizer = _tokenizer_for_model(model_name)
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
            paragraph_tokens = _token_count(paragraph, tokenizer)

            if paragraph_tokens > chunk_size:
                # Flush the current paragraph buffer first
                if buffer:
                    packed_chunks.append("\n\n".join(buffer))
                    buffer = []
                    buffer_tokens = 0

                # Setup a secondary buffer specifically for sentences
                sentence_buffer: list[str] = []
                sentence_buffer_tokens = 0

                for sentence in _sentence_split(paragraph):
                    sentence_tokens = _token_count(sentence, tokenizer)
                    if sentence_tokens > chunk_size:
                        # Flush sentence buffer if a massive sentence interrupts
                        if sentence_buffer:
                            packed_chunks.append(" ".join(sentence_buffer))
                            sentence_buffer = []
                            sentence_buffer_tokens = 0

                        packed_chunks.extend(
                            _token_window_chunks(
                                sentence,
                                tokenizer=tokenizer,
                                chunk_size=chunk_size,
                                chunk_overlap=chunk_overlap,
                            )
                        )
                    # Buffer sentences so we don't get tiny chunks
                    elif (
                        sentence_buffer
                        and sentence_buffer_tokens + sentence_tokens > chunk_size
                    ):
                        packed_chunks.append(" ".join(sentence_buffer))
                        sentence_buffer = [sentence]
                        sentence_buffer_tokens = sentence_tokens
                    else:
                        sentence_buffer.append(sentence)
                        sentence_buffer_tokens += sentence_tokens

                # Flush any remaining sentences from this paragraph
                if sentence_buffer:
                    packed_chunks.append(" ".join(sentence_buffer))

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
            # Only use the sliding window if joining strings (e.g., "\n\n") pushed it over the limit
            if _token_count(chunk, tokenizer) > chunk_size:
                finalized_chunks.extend(
                    _token_window_chunks(
                        chunk,
                        tokenizer=tokenizer,
                        chunk_size=chunk_size,
                        chunk_overlap=chunk_overlap,
                    )
                )
            else:
                finalized_chunks.append(chunk)

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
                    token_count=_token_count(clean_chunk, tokenizer),
                    metadata={"source_index": source_index, "chunk_index": chunk_index},
                )
            )

    logger.info(
        "Chunked %d documents into %d chunks",
        len(documents),
        len(document_chunks),
    )
    return document_chunks
