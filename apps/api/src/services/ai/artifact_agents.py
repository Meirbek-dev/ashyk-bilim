"""Structured artifact agents for LMS AI outputs."""

import logging
from typing import cast

from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.capabilities import Instrumentation

from config.config import get_settings
from src.services.ai.agent import get_model, get_model_settings
from src.services.ai.contracts.intents import AIIntent, normalize_ai_intent
from src.services.ai.contracts.outputs import (
    AIArtifact,
    ArtifactKind,
    AuthoringPatch,
    CodeReviewHint,
    FlashcardSet,
    HintLadder,
    RubricFeedbackExplanation,
    TeacherInterventionDraft,
    TutorAnswer,
    build_artifact_for_intent,
)
from src.services.ai.models import AgentDependencies, RetrievedChunk

logger = logging.getLogger(__name__)

_ARTIFACT_SYSTEM_PROMPT = (
    "You produce validated LMS learning artifacts. "
    "Return one structured artifact matching the requested intent. "
    "Use citation IDs exactly as provided. "
    "Do not invent citations, learner data, rubric criteria, or block IDs. "
    "For student hints, reveal progressively and avoid full-solution disclosure unless the final step explicitly allows it."
)

_INTENT_TO_KIND: dict[AIIntent, ArtifactKind] = {
    AIIntent.FREEFORM: ArtifactKind.TUTOR_ANSWER,
    AIIntent.TUTOR_ANSWER: ArtifactKind.TUTOR_ANSWER,
    AIIntent.FLASHCARDS: ArtifactKind.FLASHCARD_SET,
    AIIntent.HINT_LADDER: ArtifactKind.HINT_LADDER,
    AIIntent.CODE_REVIEW_HINT: ArtifactKind.CODE_REVIEW_HINT,
    AIIntent.AUTHORING_PATCH: ArtifactKind.AUTHORING_PATCH,
    AIIntent.RUBRIC_FEEDBACK: ArtifactKind.RUBRIC_FEEDBACK,
    AIIntent.TEACHER_INTERVENTION: ArtifactKind.TEACHER_INTERVENTION,
}

_ARTIFACT_OUTPUT_TYPES = [
    TutorAnswer,
    FlashcardSet,
    HintLadder,
    CodeReviewHint,
    AuthoringPatch,
    RubricFeedbackExplanation,
    TeacherInterventionDraft,
]

_ARTIFACT_AGENT = Agent(
    system_prompt=_ARTIFACT_SYSTEM_PROMPT,
    deps_type=AgentDependencies,
    output_type=_ARTIFACT_OUTPUT_TYPES,
    retries={"output": 2, "tools": 1},
    capabilities=[Instrumentation()] if get_settings().general_config.logfire_enabled else [],
)


@_ARTIFACT_AGENT.instructions
def _artifact_instructions(ctx: RunContext[AgentDependencies]) -> str:
    deps = ctx.deps
    context_lines = [
        f"Course: {deps.course_name}",
        f"Activity: {deps.activity_name}",
        f"Request mode: {deps.request_mode}",
    ]
    if deps.task_instruction:
        context_lines.append(f"Task details: {deps.task_instruction}")

    if deps.retrieved_chunks:
        citation_lines = []
        for index, chunk in enumerate(deps.retrieved_chunks[:5], start=1):
            citation_lines.append(f"context-{index}: {chunk.document}")
        context_lines.append("Allowed citations:\n" + "\n\n".join(citation_lines))
    else:
        context_lines.append("Allowed citations: none. Leave citations empty and state the limitation in policy_notes.")

    return "\n\n".join(context_lines)


def _allowed_citation_ids(chunks: list[RetrievedChunk]) -> set[str]:
    return {f"context-{index}" for index, chunk in enumerate(chunks[:5], start=1) if chunk.document.strip()}


def _validate_citations(artifact: AIArtifact, allowed_ids: set[str]) -> None:
    invalid_ids = [citation.id for citation in artifact.citations if citation.id not in allowed_ids]
    if invalid_ids:
        msg = f"Citation IDs must match allowed context IDs exactly. Invalid citation IDs: {', '.join(invalid_ids)}."
        raise ModelRetry(msg)


def _validate_artifact_for_intent(artifact: AIArtifact, intent: AIIntent) -> None:
    expected_kind = _INTENT_TO_KIND[intent]
    if artifact.kind != expected_kind:
        msg = f"Return a {expected_kind.value} artifact for the {intent.value} intent."
        raise ModelRetry(msg)

    if isinstance(artifact, HintLadder):
        unsafe_steps = [step.level for step in artifact.steps[:-1] if step.reveals_solution]
        if unsafe_steps:
            msg = f"Hint steps before the final step must not reveal the solution: {unsafe_steps}."
            raise ModelRetry(msg)

    if isinstance(artifact, FlashcardSet) and not artifact.cards:
        raise ModelRetry("Flashcard artifacts must include at least one card.")

    if isinstance(artifact, AuthoringPatch) and not artifact.changed_blocks:
        raise ModelRetry("Authoring patches must include changed block IDs or 'selection'.")

    if isinstance(artifact, TeacherInterventionDraft) and not artifact.privacy_notes:
        raise ModelRetry("Teacher intervention drafts must include privacy notes.")


ArtifactAgentOutput = (
    TutorAnswer
    | FlashcardSet
    | HintLadder
    | CodeReviewHint
    | AuthoringPatch
    | RubricFeedbackExplanation
    | TeacherInterventionDraft
)


@_ARTIFACT_AGENT.output_validator
def _validate_artifact_output(ctx: RunContext[AgentDependencies], artifact: ArtifactAgentOutput) -> ArtifactAgentOutput:
    return cast("ArtifactAgentOutput", validate_artifact_output_for_deps(ctx.deps, artifact))


def validate_artifact_output_for_deps(deps: AgentDependencies, artifact: AIArtifact) -> AIArtifact:
    allowed_ids = _allowed_citation_ids(deps.retrieved_chunks)
    _validate_citations(artifact, allowed_ids)
    _validate_artifact_for_intent(artifact, normalize_ai_intent(deps.requested_intent))
    return artifact


def get_artifact_agent() -> Agent[AgentDependencies, AIArtifact]:
    return cast("Agent[AgentDependencies, AIArtifact]", _ARTIFACT_AGENT)


def build_artifact_prompt(*, question: str, answer: str, intent: AIIntent) -> str:
    return (
        f"Requested intent: {intent.value}\n\n"
        f"Student or author request:\n{question.strip()}\n\n"
        f"Assistant answer to convert into a validated LMS artifact:\n{answer.strip()}\n\n"
        "Return the artifact only. Keep user-facing content concise, grounded, and actionable."
    )


async def generate_structured_artifact(
    *,
    deps: AgentDependencies,
    question: str,
    answer: str,
    intent: AIIntent,
    retrieved_chunks: list[RetrievedChunk],
) -> AIArtifact:
    if intent == AIIntent.FREEFORM:
        return build_artifact_for_intent(intent=intent, answer=answer, retrieved_chunks=retrieved_chunks)

    prompt = build_artifact_prompt(question=question, answer=answer, intent=intent)
    try:
        result = await get_artifact_agent().run(
            prompt,
            deps=deps,
            model=get_model(),
            model_settings=get_model_settings(),
        )
        return result.output
    except Exception:
        logger.exception("Structured artifact generation failed; falling back to deterministic artifact builder")
        return build_artifact_for_intent(intent=intent, answer=answer, retrieved_chunks=retrieved_chunks)
