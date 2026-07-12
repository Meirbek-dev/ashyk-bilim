from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from contextlib import aclosing
from dataclasses import dataclass

from pydantic_ai.messages import ModelMessage

from src.services.ai.agents._shared import clipped, load_prompt
from src.services.ai.providers import AIProviderUnavailable, ModelProvider
from src.services.ai.schemas import AICitation, CourseQAAnswer


@dataclass(frozen=True)
class CourseQAStreamChunk:
    """One step of a streamed course Q&A answer.

    ``answer_text`` is the full answer-so-far (not a delta) — callers compute the
    delta themselves, matching how ``stream_output`` re-validates the whole partial
    object on every chunk. ``answer`` and ``model_name`` are only populated once
    ``final`` is true.
    """

    answer_text: str
    final: bool
    answer: CourseQAAnswer | None = None
    model_name: str | None = None


async def answer_course_question(
    provider: ModelProvider,
    course_context: str,
    question: str,
    *,
    role: str,
    language: str = "auto",
    locale: str | None = None,
    message_history: Sequence[ModelMessage] | None = None,
) -> tuple[CourseQAAnswer, str]:
    prompt = f"Role: {role}\nLanguage: {language}\nQuestion: {question}\n\nCourse context:\n{clipped(course_context)}"
    try:
        result = await provider.run_structured(
            instructions=load_prompt("course_qa.md", locale=locale),
            prompt=prompt,
            output_type=CourseQAAnswer,
            message_history=message_history,
        )
        return result.output, result.model_name
    except AIProviderUnavailable:
        if provider.config.ai_draft_mode_enabled:
            return _draft_course_answer(), "draft-mode"
        raise


async def stream_course_question(
    provider: ModelProvider,
    course_context: str,
    question: str,
    *,
    role: str,
    language: str = "auto",
    locale: str | None = None,
    message_history: Sequence[ModelMessage] | None = None,
) -> AsyncIterator[CourseQAStreamChunk]:
    """Stream the answer markdown token-by-token, then yield the final structured answer.

    ``CourseQAAnswer.answer_markdown`` is declared first in the schema, so partial
    validation makes it available (and growing) well before ``citations`` parses.
    """
    prompt = f"Role: {role}\nLanguage: {language}\nQuestion: {question}\n\nCourse context:\n{clipped(course_context)}"
    try:
        # `aclosing` guarantees `provider.run_structured_stream`'s own `async with` cleans
        # up even if this generator is closed early (client disconnect, cancellation).
        async with aclosing(
            provider.run_structured_stream(
                instructions=load_prompt("course_qa.md", locale=locale),
                prompt=prompt,
                output_type=CourseQAAnswer,
                message_history=message_history,
            )
        ) as stream:
            async for chunk in stream:
                answer_text = getattr(chunk.output, "answer_markdown", None) or ""
                if chunk.final:
                    yield CourseQAStreamChunk(  # noqa: ASYNC119
                        answer_text=answer_text,
                        final=True,
                        answer=chunk.output,
                        model_name=chunk.model_name or provider.selected_model_name(),
                    )
                else:
                    yield CourseQAStreamChunk(answer_text=answer_text, final=False)  # noqa: ASYNC119
    except AIProviderUnavailable:
        if not provider.config.ai_draft_mode_enabled:
            raise
        draft = _draft_course_answer()
        yield CourseQAStreamChunk(answer_text=draft.answer_markdown, final=False)
        yield CourseQAStreamChunk(
            answer_text=draft.answer_markdown,
            final=True,
            answer=draft,
            model_name="draft-mode",
        )


def _draft_course_answer() -> CourseQAAnswer:
    return CourseQAAnswer(
        answer_markdown="Вопросы и ответы по курсу с использованием ИИ еще не включены. Вопрос был записан, но ответ от провайдера не был сгенерирован.",
        citations=[
            AICitation(
                citation_id="qa-draft",
                label="Контекст курса",
                source_type="course",
                excerpt="Черновик ответа на вопрос создан без доступа к модели.",
                confidence=0.4,
            )
        ],
        confidence="low",
        out_of_scope=False,
        follow_up_suggestions=[
            "Попросить преподавателя ответить на этот вопрос",
            "Просмотреть текущие конспекты лекций",
        ],
    )
