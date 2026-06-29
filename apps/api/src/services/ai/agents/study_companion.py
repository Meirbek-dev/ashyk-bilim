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
        answer_markdown="AI study help is not enabled yet. Use the cited course material and ask your teacher for guidance.",
        follow_up_suggestions=["Which lecture section should I review first?", "Can I try one practice question?"],
        citations=[
            AICitation(
                citation_id="study-draft",
                label="Course context",
                source_type="course",
                excerpt="Draft study answer generated without model access.",
                confidence=0.4,
            )
        ],
        confidence="low",
    )
