from collections.abc import AsyncIterator, Callable

import pytest

from config.config import AIConfig
from src.services.ai.agents.course_qa import stream_course_question
from src.services.ai.providers import (
    AIModelStreamChunk,
    AIProviderUnavailable,
    ModelProvider,
)
from src.services.ai.schemas import AICitation, CourseQAAnswer


def _fake_stream(
    chunks: list[AIModelStreamChunk[CourseQAAnswer]],
) -> Callable[..., AsyncIterator[AIModelStreamChunk[CourseQAAnswer]]]:
    async def run_structured_stream(
        self: ModelProvider,
        *,
        instructions: str,
        prompt: str,
        output_type: type[CourseQAAnswer],
        message_history: object = None,
    ) -> AsyncIterator[AIModelStreamChunk[CourseQAAnswer]]:
        for chunk in chunks:
            yield chunk

    return run_structured_stream


@pytest.mark.asyncio
async def test_stream_course_question_yields_growing_text_deltas_then_final(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    partials = [
        CourseQAAnswer(answer_markdown="Course"),
        CourseQAAnswer(answer_markdown="Course quizzes"),
        CourseQAAnswer(answer_markdown="Course quizzes are"),
    ]
    final = CourseQAAnswer(
        answer_markdown="Course quizzes are graded automatically.",
        citations=[
            AICitation(
                citation_id="c1",
                label="Lesson 3",
                source_type="activity",
                excerpt="Quizzes are graded automatically.",
                confidence=0.9,
            )
        ],
        confidence="high",
    )
    chunks = [AIModelStreamChunk(output=item, final=False) for item in partials]
    chunks.append(AIModelStreamChunk(output=final, final=True))
    monkeypatch.setattr(ModelProvider, "run_structured_stream", _fake_stream(chunks))

    provider = ModelProvider(AIConfig(ai_enabled=True))
    results = [
        chunk
        async for chunk in stream_course_question(provider, "Course context", "How are quizzes graded?", role="student")
    ]

    # Every non-final chunk carries the full answer-so-far (not a delta) — the caller computes deltas.
    assert [chunk.answer_text for chunk in results[:-1]] == [item.answer_markdown for item in partials]
    assert all(not chunk.final for chunk in results[:-1])

    last = results[-1]
    assert last.final is True
    assert last.answer is not None
    assert last.answer.answer_markdown == final.answer_markdown
    assert len(last.answer.citations) == 1
    assert last.model_name is not None


@pytest.mark.asyncio
async def test_stream_course_question_raises_when_draft_mode_disabled() -> None:
    provider = ModelProvider(AIConfig(ai_enabled=False, ai_draft_mode_enabled=False))

    with pytest.raises(AIProviderUnavailable):
        async for _chunk in stream_course_question(provider, "Course context", "Question?", role="student"):
            pass


@pytest.mark.asyncio
async def test_stream_course_question_emits_draft_answer_when_explicitly_enabled() -> None:
    provider = ModelProvider(AIConfig(ai_enabled=False, ai_draft_mode_enabled=True))

    chunks = [chunk async for chunk in stream_course_question(provider, "Course context", "Question?", role="student")]

    assert len(chunks) == 2
    assert chunks[0].final is False
    assert chunks[1].final is True
    assert chunks[1].model_name == "draft-mode"
    assert chunks[1].answer is not None
    assert chunks[1].answer.confidence == "low"
