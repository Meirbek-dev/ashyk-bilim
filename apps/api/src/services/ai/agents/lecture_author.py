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
) -> tuple[LectureReviewReport, str]:
    prompt = f"Language: {language}\n\nLecture context:\n{clipped(course_context)}"
    try:
        result = await provider.run_structured(
            instructions=load_prompt("lecture_critique.md"),
            prompt=prompt,
            output_type=LectureReviewReport,
        )
        return result.output, result.model_name
    except AIProviderUnavailable:
        return _draft_lecture_review(language), "draft-mode"


def _draft_lecture_review(language: str) -> LectureReviewReport:
    return LectureReviewReport(
        summary="AI lecture critique is not enabled yet. This draft keeps the review UI active without applying edits.",
        suggestions=[
            LectureSuggestion(
                suggestion_id=f"sug_{uuid4().hex}",
                location="Lecture body",
                title="Run provider-backed critique",
                rationale="Persistent suggestions should be generated from the real lecture context before a teacher applies changes.",
                replacement_markdown=None,
                priority="high",
            )
        ],
        citations=[
            AICitation(
                citation_id="lecture-draft",
                label="Lecture context",
                source_type="activity",
                excerpt="Draft lecture review generated without model access.",
                confidence=0.4,
            )
        ],
        language=language,
    )
