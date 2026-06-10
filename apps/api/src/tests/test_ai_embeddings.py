import pytest

from src.services.ai import embeddings
from src.types.simple_namespace import SimpleNamespace


@pytest.mark.asyncio
async def test_embed_texts_caches_by_text_model_and_dimensions(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []

    class FakeEmbeddings:
        async def create(self, *, model: str, input: list[str], dimensions: int) -> SimpleNamespace:  # noqa: A002
            calls.append(list(input))
            return SimpleNamespace(
                data=[SimpleNamespace(embedding=[float(len(text)), float(dimensions)]) for text in input]
            )

    fake_client = SimpleNamespace(embeddings=FakeEmbeddings())

    monkeypatch.setattr(embeddings, "_embedding_cache", None)
    monkeypatch.setattr(embeddings, "_embedding_cache_fingerprint", None)
    monkeypatch.setattr(embeddings, "get_async_redis_client", lambda: None)
    monkeypatch.setattr(embeddings, "get_openai_client", lambda: fake_client)

    first = await embeddings.embed_texts(
        ["alpha", "alpha", "beta"],
        "text-embedding-3-small",
    )
    second = await embeddings.embed_texts(
        ["alpha", "beta"],
        "text-embedding-3-small",
    )

    assert calls == [["alpha", "beta"]]
    assert first == [[5.0, 512.0], [5.0, 512.0], [4.0, 512.0]]
    assert second == [[5.0, 512.0], [4.0, 512.0]]
