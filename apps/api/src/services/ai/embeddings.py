import asyncio
import hashlib
import json
import logging
from threading import Lock

from cachebox import TTLCache
from openai import AsyncOpenAI

from config.config import get_settings, secret_value
from src.services.ai.chunking import count_tokens_for_model
from src.services.ai.exceptions import RetrievalError
from src.services.cache.redis_client import get_async_redis_client

logger = logging.getLogger(__name__)
from src.services.utils.circuit_breaker import CircuitBreaker

openai_breaker = CircuitBreaker("openai", failure_threshold=5, recovery_timeout=30.0)

_openai_client: AsyncOpenAI | None = None
_client_lock = Lock()
_embedding_cache: TTLCache[str, list[float]] | None = None
_embedding_cache_fingerprint: tuple[int, int] | None = None
_embedding_cache_lock = asyncio.Lock()


def get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        with _client_lock:
            if _openai_client is None:
                settings = get_settings()
                api_key = secret_value(settings.ai_config.openai_api_key)
                if not api_key:
                    raise RetrievalError("OpenAI API key not configured")
                _openai_client = AsyncOpenAI(api_key=api_key)
    return _openai_client


async def embed_texts(texts: list[str], model_name: str) -> list[list[float]]:
    if not texts:
        return []

    settings = get_settings().ai_config
    batch_size = max(1, settings.embedding_batch_size)
    batch_max_tokens = max(1, settings.embedding_batch_max_tokens)
    dimensions = settings.embedding_dimensions
    request_timeout = settings.request_timeout

    cache_keys = [
        _embedding_cache_key(text, model_name=model_name, dimensions=dimensions)
        for text in texts
    ]
    embeddings: list[list[float] | None] = await _get_cached_embeddings(
        cache_keys,
        ttl_seconds=settings.embedding_cache_ttl,
    )
    missing_by_key: dict[str, tuple[str, list[int]]] = {}

    for index, embedding in enumerate(embeddings):
        if embedding is not None:
            continue
        cache_key = cache_keys[index]
        if cache_key not in missing_by_key:
            missing_by_key[cache_key] = (texts[index], [])
        missing_by_key[cache_key][1].append(index)

    missing_texts = [entry[0] for entry in missing_by_key.values()]
    if not missing_texts:
        return [embedding for embedding in embeddings if embedding is not None]

    fetched_embeddings: list[list[float]] = []
    client = get_openai_client()

    for batch in _embedding_batches(
        missing_texts,
        model_name=model_name,
        max_items=batch_size,
        max_tokens=batch_max_tokens,
    ):
        last_error: Exception | None = None

        for attempt in range(3):
            try:

                async def _call(batch=batch):
                    return await asyncio.wait_for(
                        client.embeddings.create(
                            model=model_name,
                            input=batch,
                            dimensions=dimensions,
                        ),
                        timeout=request_timeout,
                    )

                response = await openai_breaker.call_async(_call)
                fetched_embeddings.extend(item.embedding for item in response.data)
                last_error = None
                logger.info(
                    "Created embeddings batch: size=%d model=%s",
                    len(batch),
                    model_name,
                )
                break
            except Exception as exc:
                last_error = exc
                if attempt == 2:
                    msg = f"Failed to create embeddings: {exc!s}"
                    raise RetrievalError(
                        msg,
                        details={"error_type": type(exc).__name__, "model": model_name},
                    ) from exc
                await asyncio.sleep(2**attempt)

        if last_error is not None:
            msg = f"Failed to create embeddings: {last_error!s}"
            raise RetrievalError(
                msg,
                details={"error_type": type(last_error).__name__, "model": model_name},
            )

    for cache_key, embedding in zip(missing_by_key, fetched_embeddings, strict=True):
        await _set_cached_embedding(
            cache_key,
            embedding,
            ttl_seconds=settings.embedding_cache_ttl,
        )
        for index in missing_by_key[cache_key][1]:
            embeddings[index] = embedding

    return [embedding for embedding in embeddings if embedding is not None]


def _embedding_batches(
    texts: list[str],
    *,
    model_name: str,
    max_items: int,
    max_tokens: int,
) -> list[list[str]]:
    batches: list[list[str]] = []
    current: list[str] = []
    current_tokens = 0

    for text in texts:
        token_count = count_tokens_for_model(text, model_name)
        if current and (
            len(current) >= max_items or current_tokens + token_count > max_tokens
        ):
            batches.append(current)
            current = []
            current_tokens = 0

        current.append(text)
        current_tokens += token_count

    if current:
        batches.append(current)

    return batches


def _embedding_cache_key(text: str, *, model_name: str, dimensions: int) -> str:
    digest = hashlib.sha256(text.encode()).hexdigest()
    return f"ai:embedding:{model_name}:{dimensions}:{digest}"


async def _get_cached_embeddings(
    cache_keys: list[str],
    *,
    ttl_seconds: int,
) -> list[list[float] | None]:
    local_cache = await _get_local_embedding_cache(ttl_seconds)
    embeddings: list[list[float] | None] = []
    redis_miss_keys: list[str] = []
    redis_miss_indexes: list[int] = []

    async with _embedding_cache_lock:
        for index, cache_key in enumerate(cache_keys):
            cached = local_cache.get(cache_key)
            if cached is None:
                embeddings.append(None)
                redis_miss_keys.append(cache_key)
                redis_miss_indexes.append(index)
            else:
                embeddings.append(cached)

    redis = get_async_redis_client()
    if redis is None or not redis_miss_keys:
        return embeddings

    try:
        raw_values = await redis.mget(redis_miss_keys)
    except Exception:
        logger.exception("Failed to read embedding cache from Redis")
        return embeddings

    async with _embedding_cache_lock:
        for index, cache_key, raw_value in zip(
            redis_miss_indexes,
            redis_miss_keys,
            raw_values,
            strict=True,
        ):
            embedding = _decode_embedding(raw_value)
            if embedding is None:
                continue
            embeddings[index] = embedding
            local_cache[cache_key] = embedding

    return embeddings


async def _set_cached_embedding(
    cache_key: str,
    embedding: list[float],
    *,
    ttl_seconds: int,
) -> None:
    local_cache = await _get_local_embedding_cache(ttl_seconds)
    async with _embedding_cache_lock:
        local_cache[cache_key] = embedding

    redis = get_async_redis_client()
    if redis is None:
        return

    try:
        await redis.setex(cache_key, max(1, ttl_seconds), json.dumps(embedding))
    except Exception:
        logger.exception("Failed to write embedding cache to Redis")


async def _get_local_embedding_cache(ttl_seconds: int) -> TTLCache[str, list[float]]:
    global _embedding_cache, _embedding_cache_fingerprint

    fingerprint = (5000, max(1, ttl_seconds))
    async with _embedding_cache_lock:
        if _embedding_cache is None or _embedding_cache_fingerprint != fingerprint:
            _embedding_cache = TTLCache(maxsize=fingerprint[0], ttl=fingerprint[1])
            _embedding_cache_fingerprint = fingerprint
        return _embedding_cache


def _decode_embedding(raw_value: object) -> list[float] | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, bytes):
        raw_value = raw_value.decode()
    if not isinstance(raw_value, str):
        return None
    try:
        decoded = json.loads(raw_value)
    except json.JSONDecodeError:
        return None
    if not isinstance(decoded, list):
        return None
    return [float(item) for item in decoded]
