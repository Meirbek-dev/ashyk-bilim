from __future__ import annotations

from src.services.ai.agents._shared import clipped, load_prompt
from src.services.ai.providers import AIProviderUnavailable, ModelProvider
from src.services.ai.schemas import AICitation, AIRecommendation, CourseQualityReport


async def analyze_course(
    provider: ModelProvider, course_context: str, *, language: str = "auto"
) -> tuple[CourseQualityReport, str]:
    prompt = f"Language: {language}\n\nCourse context:\n{clipped(course_context)}"
    try:
        result = await provider.run_structured(
            instructions=load_prompt("course_analysis.md"),
            prompt=prompt,
            output_type=CourseQualityReport,
        )
        return result.output, result.model_name
    except AIProviderUnavailable:
        return _draft_course_report(language), "draft-mode"


def _draft_course_report(language: str) -> CourseQualityReport:
    return CourseQualityReport(
        public_score=72,
        summary="AI is not enabled yet, so this draft report marks the course ready for human review only.",
        strengths=["Course material is present and can be inspected by the analysis pipeline."],
        risks=["Provider keys or AI feature flags are not enabled. Run a full analysis before publishing an AI score."],
        recommendations=[
            AIRecommendation(
                title="Enable provider-backed analysis",
                rationale="The current result is deterministic draft output.",
                priority="high",
                action="Set AI feature flags and provider keys, then re-run course analysis.",
            )
        ],
        citations=[
            AICitation(
                citation_id="course-draft",
                label="Course context",
                source_type="course",
                excerpt="Draft analysis generated without model access.",
                confidence=0.4,
            )
        ],
        confidence="low",
        language=language,
    )
