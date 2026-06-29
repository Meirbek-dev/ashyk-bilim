from __future__ import annotations

from src.services.ai.agents._shared import clipped, load_prompt
from src.services.ai.providers import AIProviderUnavailable, ModelProvider
from src.services.ai.schemas import AICitation, RemediationBundle, RemediationQuestion, SubmissionAnalysisReport


async def generate_remediation(
    provider: ModelProvider,
    submission_context: str,
    analysis: SubmissionAnalysisReport,
    *,
    language: str = "auto",
    locale: str | None = None,
) -> tuple[RemediationBundle, str]:
    gap_text = "\n".join(f"- {gap.concept}: {gap.remediation_goal}" for gap in analysis.knowledge_gaps)
    prompt = (
        f"Language: {language}\n\nKnowledge gaps:\n{gap_text}\n\nSubmission context:\n{clipped(submission_context)}"
    )
    try:
        result = await provider.run_structured(
            instructions=load_prompt("remediation_lecture.md", locale=locale),
            prompt=prompt,
            output_type=RemediationBundle,
        )
        return result.output, result.model_name
    except AIProviderUnavailable:
        return _draft_remediation(language), "draft-mode"


def _draft_remediation(language: str) -> RemediationBundle:
    return RemediationBundle(
        title="Черновик восполнения пробелов для проверки преподавателем",
        learning_objectives=[
            "Подтвердить основное заблуждение",
            "Потренироваться на одном исправленном примере",
            "Объяснить исправление своими словами",
        ],
        micro_lecture_markdown=(
            "Восполнение пробелов с использованием ИИ еще не включено. Преподавателю следует заменить этот черновик "
            "целевой микролекцией на основе подтвержденного пробела в знаниях."
        ),
        practice_questions=[
            RemediationQuestion(
                prompt="Какой основной концепт вам нужно повторить перед продолжением?",
                choices=[],
                answer="Концепт, подтвержденный преподавателем.",
                explanation="Этот вопрос-заглушка предотвращает автоматический пропуск до настройки ИИ.",
            )
        ],
        citations=[
            AICitation(
                citation_id="remediation-draft",
                label="Анализ решения",
                source_type="submission_analysis",
                excerpt="Черновик восполнения пробелов создан без доступа к модели.",
                confidence=0.4,
            )
        ],
        language=language,
    )
