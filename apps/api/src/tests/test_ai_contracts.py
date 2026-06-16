from types import SimpleNamespace

import pytest
from pydantic_ai import ModelRetry
from pydantic_ai.models.test import TestModel

from src.services.ai.agent import get_agent
from src.services.ai.artifact_agents import validate_artifact_output_for_deps
from src.services.ai.contracts.intents import AIIntent, normalize_ai_intent
from src.services.ai.contracts.outputs import (
    AuthoringPatch,
    EvidenceCitation,
    FlashcardSet,
    HintLadder,
    TutorAnswer,
    build_artifact_for_intent,
)
from src.services.ai.models import AgentDependencies, RetrievedChunk
from src.services.ai.orchestration.stream import StreamEventFactory


def _agent_deps(
    *,
    requested_intent: AIIntent = AIIntent.FREEFORM,
    chunks: list[RetrievedChunk] | None = None,
) -> AgentDependencies:
    return AgentDependencies(
        activity_uuid="activity-1",
        activity_name="Activity",
        course_name="Course",
        session_id="thread-1",
        requested_intent=requested_intent.value,
        retrieved_chunks=chunks or [],
    )


def test_normalize_ai_intent_accepts_product_aliases() -> None:
    assert normalize_ai_intent("hint-ladder") is AIIntent.HINT_LADDER
    assert normalize_ai_intent("AUTHORING_PATCH") is AIIntent.AUTHORING_PATCH
    assert normalize_ai_intent("unknown") is AIIntent.FREEFORM


def test_build_artifact_for_intent_shapes_product_outputs() -> None:
    flashcards = build_artifact_for_intent(
        intent=AIIntent.FLASHCARDS,
        answer="Photosynthesis converts light to energy. Chlorophyll captures light.",
        retrieved_chunks=[],
    )
    hints = build_artifact_for_intent(
        intent=AIIntent.HINT_LADDER,
        answer="Start by isolating the variable.",
        retrieved_chunks=[],
    )
    patch = build_artifact_for_intent(
        intent=AIIntent.AUTHORING_PATCH,
        answer="Rewrite the paragraph with a clearer example.",
        retrieved_chunks=[],
    )
    freeform = build_artifact_for_intent(
        intent=AIIntent.FREEFORM,
        answer="Use the course definition first.",
        retrieved_chunks=[],
    )

    assert isinstance(flashcards, FlashcardSet)
    assert len(flashcards.cards) == 2
    assert isinstance(hints, HintLadder)
    assert hints.steps[0].reveals_solution is False
    assert isinstance(patch, AuthoringPatch)
    assert patch.changed_blocks == ["selection"]
    assert isinstance(freeform, TutorAnswer)


def test_build_artifact_adds_citations_from_retrieved_chunks() -> None:
    chunk = SimpleNamespace(document="Course context explains the core concept in detail.", score=0.87)
    artifact = build_artifact_for_intent(
        intent=AIIntent.TUTOR_ANSWER,
        answer="The answer should cite retrieved context.",
        retrieved_chunks=[chunk],
    )

    assert artifact.citations[0].id == "context-1"
    assert artifact.citations[0].source_type == "activity"
    assert artifact.citations[0].score == 0.87


def test_stream_event_factory_emits_ordered_v2_events() -> None:
    artifact = build_artifact_for_intent(
        intent=AIIntent.FREEFORM,
        answer="A grounded answer.",
        retrieved_chunks=[],
    )
    factory = StreamEventFactory(thread_id="thread-1", run_id="run-1")

    events = [
        factory.started({"intent": AIIntent.FREEFORM.value}),
        factory.status(status="retrieving", message="Retrieving context"),
        factory.message_delta(delta="A grounded "),
        factory.message_delta(delta="answer."),
        factory.artifact(artifact=artifact),
        factory.finished({"artifact_kind": artifact.kind.value}),
    ]

    assert [event.sequence for event in events] == [1, 2, 3, 4, 5, 6]
    assert all(event.version == 2 for event in events)
    assert events[2].type == "message.delta"
    assert events[2].payload.delta == "A grounded "
    assert events[4].payload.artifact.kind == artifact.kind


def test_structured_artifact_validation_accepts_matching_intent_and_citations() -> None:
    chunks = [RetrievedChunk(id="chunk-1", document="Photosynthesis uses light.", score=0.9)]
    artifact = build_artifact_for_intent(
        intent=AIIntent.FLASHCARDS,
        answer="Photosynthesis converts light to energy.",
        retrieved_chunks=chunks,
    )

    validated = validate_artifact_output_for_deps(
        _agent_deps(requested_intent=AIIntent.FLASHCARDS, chunks=chunks),
        artifact,
    )

    assert validated is artifact


def test_structured_artifact_validation_rejects_wrong_intent_kind() -> None:
    artifact = build_artifact_for_intent(
        intent=AIIntent.TUTOR_ANSWER,
        answer="Use the course definition first.",
        retrieved_chunks=[],
    )

    with pytest.raises(ModelRetry):
        validate_artifact_output_for_deps(_agent_deps(requested_intent=AIIntent.FLASHCARDS), artifact)


def test_structured_artifact_validation_rejects_invented_citations() -> None:
    artifact = TutorAnswer(
        summary="Grounded answer",
        content="Use the cited context.",
        citations=[
            EvidenceCitation(
                id="made-up",
                label="Invented",
                source_type="activity",
                excerpt="No matching context.",
            )
        ],
        confidence=0.5,
    )

    with pytest.raises(ModelRetry):
        validate_artifact_output_for_deps(_agent_deps(requested_intent=AIIntent.TUTOR_ANSWER), artifact)


@pytest.mark.asyncio
async def test_student_agent_exposes_course_search_tool() -> None:
    model = TestModel()
    agent = get_agent()
    deps = _agent_deps(
        chunks=[
            RetrievedChunk(
                id="chunk-1",
                document="Course context explains the core concept.",
                score=0.8,
            )
        ]
    )

    with agent.override(model=model):
        await agent.run("Use the course context.", deps=deps, model=model)

    tool_names = {tool.name for tool in model.last_model_request_parameters.function_tools}
    assert "search_course_content" in tool_names


def test_start_activity_ai_chat_session_validation_strict_mode() -> None:
    from src.services.ai.schemas.ai import StartActivityAIChatSession

    data = {"activity_uuid": "some-uuid", "message": "Hello AI", "intent": "authoring_patch"}
    # Validate with strict=True to simulate the developer/strict environment validation behavior.
    session = StartActivityAIChatSession.model_validate(data, strict=True)
    assert session.intent == AIIntent.AUTHORING_PATCH
