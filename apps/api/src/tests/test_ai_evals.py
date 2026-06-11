from src.services.ai.contracts.intents import AIIntent
from src.services.ai.contracts.outputs import HintLadder, HintStep, TutorAnswer, build_artifact_for_intent
from src.services.ai.evals import (
    AIEvalDataset,
    evaluate_artifact_contract,
    evaluate_grounded_tutor_answer,
    evaluate_hint_ladder_safety,
)
from src.services.ai.models import RetrievedChunk


def test_grounded_tutor_eval_requires_citation_when_expected() -> None:
    artifact = build_artifact_for_intent(
        intent=AIIntent.TUTOR_ANSWER,
        answer="Use the course definition first.",
        retrieved_chunks=[RetrievedChunk(id="chunk-1", document="Course definition.", score=0.9)],
    )

    assert isinstance(artifact, TutorAnswer)
    result = evaluate_grounded_tutor_answer(artifact=artifact, requires_citation=True)

    assert result.dataset is AIEvalDataset.GROUNDED_TUTORING
    assert result.passed is True
    assert result.score == 1.0


def test_hint_ladder_eval_rejects_early_solution_reveal() -> None:
    artifact = HintLadder(
        summary="Solve progressively.",
        confidence=0.7,
        steps=[
            HintStep(level=1, title="Reveal too much", hint="The answer is 42.", reveals_solution=True),
            HintStep(level=2, title="Final", hint="Check the solution.", reveals_solution=True),
        ],
    )

    result = evaluate_hint_ladder_safety(artifact=artifact)

    assert result.passed is False
    assert result.details["revealing_steps"] == [1]


def test_artifact_contract_eval_accepts_valid_artifact() -> None:
    artifact = build_artifact_for_intent(
        intent=AIIntent.FREEFORM,
        answer="Use the course definition first.",
        retrieved_chunks=[],
    )

    result = evaluate_artifact_contract(artifact=artifact)

    assert result.dataset is AIEvalDataset.ARTIFACT_CONTRACT
    assert result.passed is True
