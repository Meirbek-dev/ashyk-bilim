from types import SimpleNamespace

from src.services.ai.contracts.intents import AIIntent, normalize_ai_intent
from src.services.ai.contracts.outputs import (
    AuthoringPatch,
    FlashcardSet,
    HintLadder,
    TutorAnswer,
    build_artifact_for_intent,
)
from src.services.ai.orchestration.stream import StreamEventFactory


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
        factory.artifact(artifact=artifact),
        factory.finished({"artifact_kind": artifact.kind.value}),
    ]

    assert [event.sequence for event in events] == [1, 2, 3, 4]
    assert all(event.version == 2 for event in events)
    assert events[2].payload.artifact.kind == artifact.kind
