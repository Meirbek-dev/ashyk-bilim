from datetime import UTC, datetime, timedelta
from typing import cast

import pytest
from fastapi import HTTPException
from pydantic_ai.messages import ModelRequest, ModelResponse
from sqlmodel import Session

from src.db.ai_qa_thread import AIQAMessage
from src.db.ai_runtime import AIThread
from src.services.ai.operations import _owned_course_thread, _qa_message_history


class _Result:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    def all(self) -> list[object]:
        return self.values

    def first(self) -> object | None:
        return self.values[0] if self.values else None


class _Session:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    def exec(self, _statement: object) -> _Result:
        return _Result(self.values)


def _message(index: int, role: str, content: str) -> AIQAMessage:
    return AIQAMessage(
        message_uuid=f"msg_{index}",
        thread_id=1,
        course_id=1,
        user_id=7,
        role=role,
        content=content,
        created_at=datetime.now(UTC) + timedelta(seconds=index),
    )


def test_history_adapter_restores_chronological_user_and_assistant_turns() -> None:
    stored_newest_first = [
        _message(4, "assistant", "Second answer"),
        _message(3, "user", "Follow-up"),
        _message(2, "assistant", "First answer"),
        _message(1, "user", "First question"),
    ]

    history = _qa_message_history(cast("Session", _Session(stored_newest_first)), thread_id=1)

    assert [type(message) for message in history] == [ModelRequest, ModelResponse, ModelRequest, ModelResponse]
    assert history[0].parts[0].content == "First question"
    assert history[-1].parts[0].content == "Second answer"


def test_history_adapter_bounds_large_threads() -> None:
    stored_newest_first = [_message(index, "user", "x" * 2000) for index in range(20, 0, -1)]

    history = _qa_message_history(cast("Session", _Session(stored_newest_first)), thread_id=1)

    assert len(history) <= 12
    assert sum(len(message.parts[0].content) for message in history) <= 12_000


def test_owned_thread_rejects_missing_or_cross_course_thread() -> None:
    with pytest.raises(HTTPException) as exc_info:
        _owned_course_thread(
            cast("Session", _Session([])),
            course_id=2,
            user_id=7,
            thread_uuid="thread_from_another_course",
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "AI_THREAD_NOT_FOUND"


def test_owned_thread_returns_exact_scoped_thread() -> None:
    thread = AIThread(thread_uuid="thread_1", user_id=7, role="student", course_id=2)

    result = _owned_course_thread(
        cast("Session", _Session([thread])),
        course_id=2,
        user_id=7,
        thread_uuid="thread_1",
    )

    assert result is thread
