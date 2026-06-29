from __future__ import annotations

from uuid import uuid4

from src.services.ai.agents._shared import clipped, load_prompt
from src.services.ai.providers import AIProviderUnavailable, ModelProvider
from src.services.ai.schemas import AICitation, LectureReviewReport, LectureSuggestion


async def critique_lecture(
    provider: ModelProvider,
    course_context: str,
    *,
    language: str = "auto",
    locale: str | None = None,
) -> tuple[LectureReviewReport, str]:
    prompt = f"Language: {language}\n\nLecture context:\n{clipped(course_context)}"
    try:
        result = await provider.run_structured(
            instructions=load_prompt("lecture_critique.md", locale=locale),
            prompt=prompt,
            output_type=LectureReviewReport,
        )
        return result.output, result.model_name
    except AIProviderUnavailable:
        return _draft_lecture_review(language), "draft-mode"


def _draft_lecture_review(language: str) -> LectureReviewReport:
    return LectureReviewReport(
        summary="Критика лекции с использованием ИИ еще не включена. Этот черновик поддерживает интерфейс рецензирования активным без применения изменений.",
        suggestions=[
            LectureSuggestion(
                suggestion_id=f"sug_{uuid4().hex}",
                location="Текст лекции",
                title="Запустить критику с использованием провайдера",
                rationale="Постоянные предложения должны генерироваться на основе реального контекста лекции перед тем, как преподаватель применит изменения.",
                replacement_markdown=None,
                priority="high",
            )
        ],
        citations=[
            AICitation(
                citation_id="lecture-draft",
                label="Контекст лекции",
                source_type="activity",
                excerpt="Черновик обзора лекции создан без доступа к модели.",
                confidence=0.4,
            )
        ],
        language=language,
    )
