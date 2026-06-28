from __future__ import annotations

from src.services.ai.agents._shared import clipped, load_prompt
from src.services.ai.providers import AIProviderUnavailable, ModelProvider
from src.services.ai.schemas import AICitation, AIKnowledgeGap, SubmissionAnalysisReport


async def analyze_submission(
    provider: ModelProvider,
    submission_context: str,
    *,
    language: str = "auto",
) -> tuple[SubmissionAnalysisReport, str]:
    prompt = f"Language: {language}\n\nSubmission context:\n{clipped(submission_context)}"
    try:
        result = await provider.run_structured(
            instructions=load_prompt("submission_analysis.md"),
            prompt=prompt,
            output_type=SubmissionAnalysisReport,
        )
        return result.output, result.model_name
    except AIProviderUnavailable:
        return _draft_submission_report(language), "draft-mode"


def _draft_submission_report(language: str) -> SubmissionAnalysisReport:
    return SubmissionAnalysisReport(
        summary="AI is not enabled yet, so this draft highlights the need for teacher review before remediation gates are enforced.",
        knowledge_gaps=[
            AIKnowledgeGap(
                concept="Submission reasoning",
                severity="medium",
                evidence="No provider-backed analysis has been run.",
                remediation_goal="Review the submitted work and identify the first misconception manually.",
            )
        ],
        next_action="Enable AI analysis or ask a teacher to confirm the remediation focus.",
        citations=[
            AICitation(
                citation_id="submission-draft",
                label="Submission context",
                source_type="submission",
                excerpt="Draft submission analysis generated without model access.",
                confidence=0.4,
            )
        ],
        confidence="low",
        language=language,
    )
