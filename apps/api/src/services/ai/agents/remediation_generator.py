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
) -> tuple[RemediationBundle, str]:
    gap_text = "\n".join(f"- {gap.concept}: {gap.remediation_goal}" for gap in analysis.knowledge_gaps)
    prompt = (
        f"Language: {language}\n\nKnowledge gaps:\n{gap_text}\n\nSubmission context:\n{clipped(submission_context)}"
    )
    try:
        result = await provider.run_structured(
            instructions=load_prompt("remediation_lecture.md"),
            prompt=prompt,
            output_type=RemediationBundle,
        )
        return result.output, result.model_name
    except AIProviderUnavailable:
        return _draft_remediation(language), "draft-mode"


def _draft_remediation(language: str) -> RemediationBundle:
    return RemediationBundle(
        title="Teacher review remediation draft",
        learning_objectives=[
            "Confirm the main misconception",
            "Practice one corrected example",
            "Explain the correction in your own words",
        ],
        micro_lecture_markdown=(
            "AI remediation is not enabled yet. A teacher should replace this draft with a focused micro-lecture "
            "based on the confirmed knowledge gap."
        ),
        practice_questions=[
            RemediationQuestion(
                prompt="What is the main concept you need to review before continuing?",
                choices=[],
                answer="The concept confirmed by the teacher.",
                explanation="This placeholder question prevents silent gate releases before AI is configured.",
            )
        ],
        citations=[
            AICitation(
                citation_id="remediation-draft",
                label="Submission analysis",
                source_type="submission_analysis",
                excerpt="Draft remediation generated without model access.",
                confidence=0.4,
            )
        ],
        language=language,
    )
