from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Never

import pytest
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from src.services.ai.agent import get_model
from src.services.ai.chunking import chunk_documents
from src.services.ai.models import (
    ChatMessage,
    ChatMessageMetadata,
    ChatRole,
    DeltaEvent,
    FinalEvent,
    RetrievedChunk,
    StatusEvent,
)
from src.services.ai.service import (
    _ChatContext,
    _extract_request_locale,
    generate_chat_answer,
    stream_chat_answer,
)
from src.services.ai.session_store import append_messages, load_chat_session
from src.services.ai.streaming import format_sse_message


class _FakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, list[str]] = {}
        self.expirations: dict[str, int] = {}

    def ping(self) -> bool:
        return True

    def llen(self, key: str) -> int:
        return len(self.data.get(key, []))

    def lrange(self, key: str, start: int, end: int) -> list[str]:
        items = self.data.get(key, [])
        if not items:
            return []
        normalized_end = None if end == -1 else end + 1
        return items[start:normalized_end]

    def pipeline(self) -> _FakeRedisPipeline:
        return _FakeRedisPipeline(self)


class _FakeRedisPipeline:
    def __init__(self, client: _FakeRedis) -> None:
        self.client = client
        self.ops: list[tuple[str, tuple]] = []

    def rpush(self, key: str, *values: str) -> _FakeRedisPipeline:
        self.ops.append(("rpush", (key, values)))
        return self

    def expire(self, key: str, ttl: int) -> _FakeRedisPipeline:
        self.ops.append(("expire", (key, ttl)))
        return self

    def ltrim(self, key: str, start: int, end: int) -> _FakeRedisPipeline:
        self.ops.append(("ltrim", (key, start, end)))
        return self

    def execute(self) -> None:
        for op, args in self.ops:
            if op == "rpush":
                key, values = args
                self.client.data.setdefault(key, []).extend(values)
            elif op == "expire":
                key, ttl = args
                self.client.expirations[key] = ttl
            elif op == "ltrim":
                key, start, end = args
                items = self.client.data.get(key, [])
                normalized_end = None if end == -1 else end + 1
                self.client.data[key] = items[start:normalized_end]


def test_chunk_documents_are_deterministic() -> None:
    docs = ["Paragraph one.\n\nParagraph two."]

    first = chunk_documents(docs, "text-embedding-3-small")
    second = chunk_documents(docs, "text-embedding-3-small")

    assert [chunk.id for chunk in first] == [chunk.id for chunk in second]
    assert first
    assert all(chunk.token_count > 0 for chunk in first)


def test_session_store_appends_and_loads_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_redis = _FakeRedis()
    monkeypatch.setattr(
        "src.services.ai.session_store._get_redis_client", lambda: fake_redis
    )

    messages = [
        ChatMessage(
            id=str(index),
            role=ChatRole.USER if index % 2 == 0 else ChatRole.ASSISTANT,
            content=f"message-{index}",
            metadata=ChatMessageMetadata(activity_uuid="activity-1", user_id=7),
        )
        for index in range(12)
    ]

    append_messages("user_7_session", messages)
    session = load_chat_session("user_7_session", 7)

    assert session.storage_type == "redis"
    assert session.total_messages == 12
    assert len(session.messages) == 10
    assert session.messages[0].content == "message-2"
    assert session.messages[-1].content == "message-11"
    assert session.conversation_summary == "User: message-0\nAssistant: message-1"


def test_format_sse_message_serializes_typed_events() -> None:
    payload = format_sse_message(StatusEvent(status="processing", aichat_uuid="s-1"))

    assert payload.startswith("data: ")
    assert '"version": 1' in payload
    assert '"type": "status"' in payload
    assert '"aichat_uuid": "s-1"' in payload


def test_get_model_uses_openrouter_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_ai_config = type(
        "AIConfig",
        (),
        {
            "chat_model": "deepseek/deepseek-v4-flash",
            "openrouter_api_key": "test-key",
            "openrouter_base_url": "https://openrouter.ai/api/v1",
            "app_url": "https://cs-mooc.tou.edu.kz",
            "app_name": "Ashyq Bilim",
        },
    )()
    fake_settings = type("Settings", (), {"ai_config": fake_ai_config})()

    monkeypatch.setattr("src.services.ai.agent.get_settings", lambda: fake_settings)

    model = get_model()

    assert isinstance(model, OpenAIChatModel)
    assert isinstance(model._provider, OpenAIProvider)
    assert model._provider.client.api_key == "test-key"


@dataclass
class _FakeResponseMessage:
    model_name: str | None = "openai:deepseek/deepseek-v4-flash"
    finish_reason: str | None = "stop"


class _FakeRunResult:
    def __init__(self, output: str) -> None:
        self.output = output

    def all_messages(self) -> list[_FakeResponseMessage]:
        return [_FakeResponseMessage()]


class _FakeAgent:
    async def run(self, *_args, **_kwargs) -> _FakeRunResult:
        return _FakeRunResult("Answer from agent")


class _FakeStreamResult:
    async def stream_text(
        self, *, delta: bool = False, debounce_by: float | None = None
    ):
        assert delta is True
        assert debounce_by is None
        for part in ["Answer ", "from ", "agent"]:
            yield part

    async def get_output(self) -> str:
        return "Answer from agent"


class _FakeStreamingAgent:
    @asynccontextmanager
    async def run_stream(self, *_args, **_kwargs):
        yield _FakeStreamResult()


class _FakeModel:
    pass


def _chat_context(locale: str = "ru-RU") -> _ChatContext:
    activity = type(
        "Activity", (), {"activity_uuid": "activity-1", "name": "Lecture 1"}
    )()
    course = type("Course", (), {"name": "Physics"})()
    return _ChatContext(
        activity=activity,
        course=course,
        documents=["Gravity is an attractive force between masses."],
        session_id="user_7_session",
        session_history=[],
        conversation_summary="User: Earlier asked for a concise explanation.",
        user_id=7,
        request_id="req-1",
        locale=locale,
    )


def test_extract_request_locale_prefers_explicit_header() -> None:
    request = type(
        "Request",
        (),
        {
            "headers": {"x-locale": "kk-KZ", "accept-language": "en-US,en;q=0.9"},
            "cookies": {"NEXT_LOCALE": "ru-RU"},
        },
    )()

    assert _extract_request_locale(request) == "kk-KZ"


def test_extract_request_locale_ignores_invalid_header() -> None:
    request = type(
        "Request",
        (),
        {
            "headers": {"x-locale": "de-DE", "accept-language": "kk-KZ,kk;q=0.9"},
            "cookies": {},
        },
    )()

    assert _extract_request_locale(request) == "kk-KZ"


@pytest.mark.asyncio
async def test_generate_chat_answer_persists_messages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    persisted: list[ChatMessage] = []

    async def _fake_retrieve_chunks(**_kwargs):
        return [RetrievedChunk(id="c1", document="Gravity explains falling bodies.")]

    monkeypatch.setattr(
        "src.services.ai.service.retrieve_chunks", _fake_retrieve_chunks
    )
    monkeypatch.setattr("src.services.ai.service.get_agent", _FakeAgent)
    monkeypatch.setattr("src.services.ai.service.get_model", _FakeModel)
    monkeypatch.setattr(
        "src.services.ai.service.append_messages",
        lambda _session_id, messages: persisted.extend(messages),
    )

    answer = await generate_chat_answer(
        ctx=_chat_context(),
        question="What is gravity and how does it affect falling bodies in classical mechanics when teaching the relationship between force, mass, and acceleration in a full lesson explanation?",
    )

    assert answer.message == "Answer from agent"
    assert answer.chunk_count == 1
    assert [message.role for message in persisted] == [
        ChatRole.USER,
        ChatRole.ASSISTANT,
    ]


@pytest.mark.asyncio
async def test_generate_chat_answer_skips_retrieval_for_translation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    persisted: list[ChatMessage] = []

    async def _unexpected_retrieve_chunks(**_kwargs) -> Never:
        raise AssertionError("retrieve_chunks should not run for translation prompts")

    monkeypatch.setattr(
        "src.services.ai.service.retrieve_chunks", _unexpected_retrieve_chunks
    )
    monkeypatch.setattr("src.services.ai.service.get_agent", _FakeAgent)
    monkeypatch.setattr("src.services.ai.service.get_model", _FakeModel)
    monkeypatch.setattr(
        "src.services.ai.service.append_messages",
        lambda _session_id, messages: persisted.extend(messages),
    )

    answer = await generate_chat_answer(
        ctx=_chat_context(),
        question="Translate to German: Hello world",
    )

    assert answer.message == "Answer from agent"
    assert answer.chunk_count == 0
    assert [message.role for message in persisted] == [
        ChatRole.USER,
        ChatRole.ASSISTANT,
    ]


@pytest.mark.asyncio
async def test_stream_chat_answer_localizes_status_messages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_retrieve_chunks(**_kwargs):
        return [RetrievedChunk(id="c1", document="Gravity explains falling bodies.")]

    monkeypatch.setattr(
        "src.services.ai.service.retrieve_chunks", _fake_retrieve_chunks
    )
    monkeypatch.setattr("src.services.ai.service.get_agent", _FakeStreamingAgent)
    monkeypatch.setattr("src.services.ai.service.get_model", _FakeModel)

    events = [
        event
        async for event in stream_chat_answer(
            ctx=_chat_context(locale="ru-RU"),
            question="Объясните гравитацию, закон всемирного тяготения и то, как это влияет на падение тел в классической механике.",
        )
    ]

    assert isinstance(events[0], StatusEvent)
    assert events[0].message == "Подготавливаем ваш запрос."
    assert isinstance(events[1], StatusEvent)
    assert events[1].message == "Подбираем релевантный контекст курса."
    assert isinstance(events[2], StatusEvent)
    assert events[2].message == "Формируем ответ."
