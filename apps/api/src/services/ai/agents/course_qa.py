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
        answer_markdown="AI course Q&A is not enabled yet. The question was recorded, but no provider-backed answer was generated.",
        citations=[
            AICitation(
                citation_id="qa-draft",
                label="Course context",
                source_type="course",
                excerpt="Draft Q&A response generated without model access.",
                confidence=0.4,
            )
        ],
        confidence="low",
        out_of_scope=False,
        follow_up_suggestions=["Ask a teacher to answer this question", "Review the current lecture notes"],
    )
