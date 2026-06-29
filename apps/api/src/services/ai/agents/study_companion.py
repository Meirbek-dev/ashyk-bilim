from __future__ import annotations

from typing import Literal

from src.services.ai.agents._shared import clipped, load_prompt
from src.services.ai.providers import AIProviderUnavailable, ModelProvider
from src.services.ai.schemas import AICitation, StudyCompanionAnswer

StudyMode = Literal["explain", "practice", "flashcards", "summarize", "deepen"]


async def answer_study_prompt(
    provider: ModelProvider,
    course_context: str,
    question: str,
    *,
    mode: StudyMode,
    language: str = "auto",
    locale: str | None = None,
) -> tuple[StudyCompanionAnswer, str]:
    prompt = f"Mode: {mode}\nLanguage: {language}\nStudent question: {question}\n\nCourse context:\n{clipped(course_context)}"
    try:
        result = await provider.run_structured(
            instructions=load_prompt("study_companion.md", locale=locale),
            prompt=prompt,
            output_type=StudyCompanionAnswer,
        )
        return result.output, result.model_name
    except AIProviderUnavailable:
        return _draft_study_answer(mode), "draft-mode"


def _draft_study_answer(mode: StudyMode) -> StudyCompanionAnswer:
    return StudyCompanionAnswer(
        mode=mode,
        answer_markdown="Помощь в обучении с использованием ИИ еще не включена. Используйте цитируемые материалы курса и обратитесь к преподавателю за руководством.",
        follow_up_suggestions=["Какой раздел лекции мне следует изучить в первую очередь?", "Могу ли я попробовать один практический вопрос?"],
        citations=[
            AICitation(
                citation_id="study-draft",
                label="Контекст курса",
                source_type="course",
                excerpt="Черновик ответа помощника создан без доступа к модели.",
                confidence=0.4,
            )
        ],
        confidence="low",
    )
