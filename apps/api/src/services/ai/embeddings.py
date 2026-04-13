import asyncio
import logging
from threading import Lock

# Direct openai SDK — PydanticAI's openai extra only wraps chat completions,
# not the embeddings API, so we need the SDK directly here.
from openai import AsyncOpenAI

from config.config import get_settings
from src.services.ai.exceptions import RetrievalError

logger = logging.getLogger(__name__)

_openai_client: AsyncOpenAI | None = None
_client_lock = Lock()


def get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        with _client_lock:
            if _openai_client is None:
                settings = get_settings()
                api_key = settings.ai_config.openai_api_key
                if not api_key:
                    raise RetrievalError("OpenAI API key not configured")
                _openai_client = AsyncOpenAI(api_key=api_key)
    return _openai_client


async def embed_texts(texts: list[str], model_name: str) -> list[list[float]]:
    if not texts:
        return []

    settings = get_settings().ai_config
    batch_size = max(1, settings.embedding_batch_size)
    dimensions = settings.embedding_dimensions
    request_timeout = settings.request_timeout
    client = get_openai_client()

    embeddings: list[list[float]] = []

    for start in range(0, len(texts), batch_size):
        batch = texts[start : start + batch_size]
        last_error: Exception | None = None

        for attempt in range(3):
            try:
                response = await asyncio.wait_for(
                    client.embeddings.create(
                        model=model_name,
                        input=batch,
                        dimensions=dimensions,
                    ),
                    timeout=request_timeout,
                )
                embeddings.extend(item.embedding for item in response.data)
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

        if last_error is not None and len(embeddings) < start + len(batch):
            msg = f"Failed to create embeddings: {last_error!s}"
            raise RetrievalError(
                msg,
                details={"error_type": type(last_error).__name__, "model": model_name},
            )

    return embeddings
