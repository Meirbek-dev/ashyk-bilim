from __future__ import annotations

from src.services.ai.agents._shared import clipped, load_prompt
from src.services.ai.providers import AIProviderUnavailable, ModelProvider
from src.services.ai.schemas import AICitation, CourseQAAnswer


async def answer_course_question(
    provider: ModelProvider,
    course_context: str,
    question: str,
    *,
    role: str,
    language: str = "auto",
    locale: str | None = None,
) -> tuple[CourseQAAnswer, str]:
    prompt = f"Role: {role}\nLanguage: {language}\nQuestion: {question}\n\nCourse context:\n{clipped(course_context)}"
    try:
        result = await provider.run_structured(
            instructions=load_prompt("course_qa.md", locale=locale),
            prompt=prompt,
            output_type=CourseQAAnswer,
        )
        return result.output, result.model_name
    except AIProviderUnavailable:
        return _draft_course_answer(), "draft-mode"


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
        follow_up_suggestions=["Попросить преподавателя ответить на этот вопрос", "Просмотреть текущие конспекты лекций"],
    )
