from __future__ import annotations

from src.services.ai.agents._shared import clipped, load_prompt
from src.services.ai.providers import AIProviderUnavailable, ModelProvider
from src.services.ai.schemas import AICitation, AIKnowledgeGap, SubmissionAnalysisReport


async def analyze_submission(
    provider: ModelProvider,
    submission_context: str,
    *,
    language: str = "auto",
    locale: str | None = None,
) -> tuple[SubmissionAnalysisReport, str]:
    prompt = f"Language: {language}\n\nSubmission context:\n{clipped(submission_context)}"
    try:
        result = await provider.run_structured(
            instructions=load_prompt("submission_analysis.md", locale=locale),
            prompt=prompt,
            output_type=SubmissionAnalysisReport,
        )
        return result.output, result.model_name
    except AIProviderUnavailable:
        return _draft_submission_report(language), "draft-mode"


def _draft_submission_report(language: str) -> SubmissionAnalysisReport:
    return SubmissionAnalysisReport(
        summary="ИИ еще не включен, поэтому данный черновик подчеркивает необходимость проверки преподавателем перед применением ограничений на восполнение пробелов.",
        knowledge_gaps=[
            AIKnowledgeGap(
                concept="Ход решения",
                severity="medium",
                evidence="Анализ с использованием провайдера не запускался.",
                remediation_goal="Проверьте отправленную работу и вручную выявите первое заблуждение.",
            )
        ],
        next_action="Включите анализ ИИ или попросите преподавателя подтвердить тему восполнения пробелов.",
        citations=[
            AICitation(
                citation_id="submission-draft",
                label="Контекст решения",
                source_type="submission",
                excerpt="Черновик анализа решения создан без доступа к модели.",
                confidence=0.4,
            )
        ],
        confidence="low",
        language=language,
    )
