"""Deterministic AI quality checks for CI and future Pydantic Evals datasets."""

from enum import StrEnum

from pydantic import Field

from src.db.strict_base_model import PydanticStrictBaseModel
from src.services.ai.contracts.outputs import AIArtifact, HintLadder, TutorAnswer
from src.types import JsonObject


class AIEvalDataset(StrEnum):
    GROUNDED_TUTORING = "grounded_tutoring"
    NO_SOLUTION_HINTING = "no_solution_hinting"
    ARTIFACT_CONTRACT = "artifact_contract"
    MULTILINGUAL = "multilingual"


class AIEvalCase(PydanticStrictBaseModel):
    name: str
    dataset: AIEvalDataset
    prompt: str
    expected: JsonObject = Field(default_factory=dict)
    metadata: JsonObject = Field(default_factory=dict)


class AIEvalCheckResult(PydanticStrictBaseModel):
    dataset: AIEvalDataset
    name: str
    passed: bool
    score: float = Field(ge=0, le=1)
    reason: str
    details: JsonObject = Field(default_factory=dict)


def evaluate_grounded_tutor_answer(*, artifact: TutorAnswer, requires_citation: bool) -> AIEvalCheckResult:
    has_citation = bool(artifact.citations)
    passed = has_citation if requires_citation else True
    score = 1.0 if passed else 0.0
    reason = "Tutor answer includes evidence." if passed else "Tutor answer requires at least one citation."
    return AIEvalCheckResult(
        dataset=AIEvalDataset.GROUNDED_TUTORING,
        name="citation_coverage",
        passed=passed,
        score=score,
        reason=reason,
        details={"citation_count": len(artifact.citations), "requires_citation": requires_citation},
    )


def evaluate_hint_ladder_safety(*, artifact: HintLadder) -> AIEvalCheckResult:
    revealing_steps = [step.level for step in artifact.steps[:-1] if step.reveals_solution]
    passed = not revealing_steps
    return AIEvalCheckResult(
        dataset=AIEvalDataset.NO_SOLUTION_HINTING,
        name="progressive_disclosure",
        passed=passed,
        score=1.0 if passed else 0.0,
        reason="Hints preserve progressive disclosure."
        if passed
        else "Hint ladder reveals the solution before the final step.",
        details={"revealing_steps": revealing_steps},
    )


def evaluate_artifact_contract(*, artifact: AIArtifact) -> AIEvalCheckResult:
    has_summary = bool(artifact.summary.strip())
    confidence_in_range = 0 <= artifact.confidence <= 1
    passed = has_summary and confidence_in_range
    return AIEvalCheckResult(
        dataset=AIEvalDataset.ARTIFACT_CONTRACT,
        name="artifact_shape",
        passed=passed,
        score=1.0 if passed else 0.0,
        reason="Artifact has a usable summary and calibrated confidence."
        if passed
        else "Artifact is missing a summary or has invalid confidence.",
        details={"kind": artifact.kind.value, "confidence": artifact.confidence},
    )
