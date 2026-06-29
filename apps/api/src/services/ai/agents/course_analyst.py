from __future__ import annotations

from src.services.ai.agents._shared import clipped, load_prompt
from src.services.ai.providers import AIProviderUnavailable, ModelProvider
from src.services.ai.schemas import AICitation, AIRecommendation, CourseQualityReport


async def analyze_course(
    provider: ModelProvider, course_context: str, *, language: str = "auto", locale: str | None = None
) -> tuple[CourseQualityReport, str]:
    prompt = f"Language: {language}\n\nCourse context:\n{clipped(course_context)}"
    try:
        result = await provider.run_structured(
            instructions=load_prompt("course_analysis.md", locale=locale),
            prompt=prompt,
            output_type=CourseQualityReport,
        )
        return result.output, result.model_name
    except AIProviderUnavailable:
        return _draft_course_report(language), "draft-mode"


def _draft_course_report(language: str) -> CourseQualityReport:
    return CourseQualityReport(
        public_score=72,
        summary="Анализ ИИ еще не включен, поэтому этот черновик отчета отмечает, что курс готов только для проверки человеком.",
        strengths=["Материалы курса присутствуют и могут быть проверены конвейером анализа."],
        risks=["Ключи провайдера или флаги функций ИИ не включены. Запустите полный анализ перед публикацией оценки ИИ."],
        recommendations=[
            AIRecommendation(
                title="Включить анализ с использованием провайдера",
                rationale="Текущий результат является детерминированным черновиком.",
                priority="high",
                action="Настройте флаги функций ИИ и ключи провайдера, затем запустите анализ курса повторно.",
            )
        ],
        citations=[
            AICitation(
                citation_id="course-draft",
                label="Контекст курса",
                source_type="course",
                excerpt="Черновик анализа создан без доступа к модели.",
                confidence=0.4,
            )
        ],
        confidence="low",
        language=language,
    )
