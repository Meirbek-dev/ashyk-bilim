import pytest

from src.services.ai.chunking import chunk_documents, count_tokens_for_model


def test_openai_embedding_model_uses_tiktoken() -> None:
    assert count_tokens_for_model("Hello, world", "text-embedding-3-small") > 0


def test_unknown_model_fails_instead_of_falling_back() -> None:
    with pytest.raises(RuntimeError, match="No tiktoken encoding configured"):
        count_tokens_for_model("Hello", "unknown-local-model")


def test_chunk_documents_handles_multilingual_text(monkeypatch: pytest.MonkeyPatch) -> None:
    from config.config import reload_platform_config_cache

    monkeypatch.setenv("PLATFORM_DOMAIN", "example.test")
    monkeypatch.setenv("PLATFORM_ALLOWED_REGEXP", r"^https://example\.test$")
    monkeypatch.setenv("PLATFORM_SQL_CONNECTION_STRING", "sqlite://")
    monkeypatch.setenv("PLATFORM_REDIS_CONNECTION_STRING", "redis://localhost:6379/0")
    monkeypatch.setenv("PLATFORM_JWT_SECRET", "test-secret-at-least-32-bytes")
    monkeypatch.setenv("PLATFORM_AI_CHUNK_SIZE", "32")
    monkeypatch.setenv("PLATFORM_AI_CHUNK_OVERLAP", "4")
    reload_platform_config_cache()

    text = (
        "English paragraph with enough words to tokenize. "
        "Русский абзац с несколькими словами для проверки. "
        "Қазақша мәтін токенизацияны тексеру үшін."
    )

    chunks = chunk_documents([text], "text-embedding-3-small")

    assert chunks
    assert all(chunk.token_count <= 32 for chunk in chunks)
