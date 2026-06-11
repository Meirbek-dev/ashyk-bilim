"""Structured AI artifacts for the LMS assistant runtime."""

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import Field

from src.db.strict_base_model import PydanticStrictBaseModel
from src.services.ai.contracts.intents import AIIntent


class ArtifactKind(StrEnum):
    TUTOR_ANSWER = "tutor_answer"
    FLASHCARD_SET = "flashcard_set"
    HINT_LADDER = "hint_ladder"
    CODE_REVIEW_HINT = "code_review_hint"
    AUTHORING_PATCH = "authoring_patch"
    RUBRIC_FEEDBACK = "rubric_feedback"
    TEACHER_INTERVENTION = "teacher_intervention"
    SAFETY_REFUSAL = "safety_refusal"


class EvidenceCitation(PydanticStrictBaseModel):
    id: str
    label: str
    source_type: Literal["course", "activity", "submission", "rubric", "system", "unknown"] = "unknown"
    excerpt: str
    score: float | None = None


class ArtifactBase(PydanticStrictBaseModel):
    summary: str
    citations: list[EvidenceCitation] = Field(default_factory=list)
    confidence: float = Field(default=0.55, ge=0, le=1)
    policy_notes: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)


class TutorAnswer(ArtifactBase):
    kind: Literal[ArtifactKind.TUTOR_ANSWER] = ArtifactKind.TUTOR_ANSWER
    content: str


class Flashcard(PydanticStrictBaseModel):
    front: str
    back: str
    difficulty: Literal["intro", "practice", "challenge"] = "practice"
    citation_ids: list[str] = Field(default_factory=list)


class FlashcardSet(ArtifactBase):
    kind: Literal[ArtifactKind.FLASHCARD_SET] = ArtifactKind.FLASHCARD_SET
    cards: list[Flashcard]


class HintStep(PydanticStrictBaseModel):
    level: int = Field(ge=1, le=5)
    title: str
    hint: str
    reveals_solution: bool = False
    citation_ids: list[str] = Field(default_factory=list)


class HintLadder(ArtifactBase):
    kind: Literal[ArtifactKind.HINT_LADDER] = ArtifactKind.HINT_LADDER
    steps: list[HintStep]


class CodeReviewHint(ArtifactBase):
    kind: Literal[ArtifactKind.CODE_REVIEW_HINT] = ArtifactKind.CODE_REVIEW_HINT
    issue: str
    next_step: str
    related_test: str | None = None
    reveals_solution: bool = False


class AuthoringPatch(ArtifactBase):
    kind: Literal[ArtifactKind.AUTHORING_PATCH] = ArtifactKind.AUTHORING_PATCH
    patch_markdown: str
    changed_blocks: list[str] = Field(default_factory=list)
    risk_labels: list[str] = Field(default_factory=list)


class RubricFeedbackExplanation(ArtifactBase):
    kind: Literal[ArtifactKind.RUBRIC_FEEDBACK] = ArtifactKind.RUBRIC_FEEDBACK
    feedback: str
    rubric_criteria: list[str] = Field(default_factory=list)


class TeacherInterventionDraft(ArtifactBase):
    kind: Literal[ArtifactKind.TEACHER_INTERVENTION] = ArtifactKind.TEACHER_INTERVENTION
    cohort_summary: str
    intervention_draft: str
    privacy_notes: list[str] = Field(default_factory=list)


class SafetyRefusal(ArtifactBase):
    kind: Literal[ArtifactKind.SAFETY_REFUSAL] = ArtifactKind.SAFETY_REFUSAL
    reason: str
    recovery: str


AIArtifact = Annotated[
    TutorAnswer
    | FlashcardSet
    | HintLadder
    | CodeReviewHint
    | AuthoringPatch
    | RubricFeedbackExplanation
    | TeacherInterventionDraft
    | SafetyRefusal,
    Field(discriminator="kind"),
]


def _summary(text: str) -> str:
    compact = " ".join(text.split())
    if len(compact) <= 160:
        return compact
    return f"{compact[:157].rstrip()}..."


def _citations_from_chunks(chunks: list[object]) -> list[EvidenceCitation]:
    citations: list[EvidenceCitation] = []
    for index, chunk in enumerate(chunks[:5], start=1):
        document = getattr(chunk, "document", "")
        score = getattr(chunk, "score", None)
        if not isinstance(document, str) or not document.strip():
            continue
        citations.append(
            EvidenceCitation(
                id=f"context-{index}",
                label=f"Course context {index}",
                source_type="activity",
                excerpt=_summary(document),
                score=score if isinstance(score, (int, float)) else None,
            )
        )
    return citations


def build_artifact_for_intent(
    *,
    intent: AIIntent,
    answer: str,
    retrieved_chunks: list[object],
) -> (
    TutorAnswer
    | FlashcardSet
    | HintLadder
    | CodeReviewHint
    | AuthoringPatch
    | RubricFeedbackExplanation
    | TeacherInterventionDraft
):
    citations = _citations_from_chunks(retrieved_chunks)
    citation_ids = [citation.id for citation in citations[:2]]
    policy_notes = ["Grounded in retrieved course context when citations are shown."]
    next_actions = ["Ask for an example.", "Request a shorter explanation."]
    summary = _summary(answer)

    if intent == AIIntent.FLASHCARDS:
        sentences = [part.strip() for part in answer.replace("\n", " ").split(".") if part.strip()]
        cards = [
            Flashcard(
                front=f"What should you remember about point {index}?",
                back=sentence,
                difficulty="practice",
                citation_ids=citation_ids,
            )
            for index, sentence in enumerate(sentences[:5], start=1)
        ]
        if not cards:
            cards = [Flashcard(front="What is the main idea?", back=answer, citation_ids=citation_ids)]
        return FlashcardSet(
            summary=summary,
            cards=cards,
            citations=citations,
            confidence=0.62 if citations else 0.48,
            policy_notes=policy_notes,
            next_actions=["Practice these cards.", "Generate a quiz from this topic."],
        )

    if intent == AIIntent.HINT_LADDER:
        return HintLadder(
            summary=summary,
            steps=[
                HintStep(
                    level=1,
                    title="Locate the concept",
                    hint="Find the part of the activity that defines the key idea.",
                    citation_ids=citation_ids,
                ),
                HintStep(level=2, title="Connect it to the task", hint=summary, citation_ids=citation_ids),
                HintStep(
                    level=3,
                    title="Try the next move",
                    hint="Apply the idea to one small example before solving the full task.",
                    citation_ids=citation_ids,
                ),
            ],
            citations=citations,
            confidence=0.6 if citations else 0.45,
            policy_notes=[*policy_notes, "Hints avoid revealing a full solution by default."],
            next_actions=["Show the next hint.", "Check my attempt."],
        )

    if intent == AIIntent.CODE_REVIEW_HINT:
        return CodeReviewHint(
            summary=summary,
            issue=summary,
            next_step="Run the smallest failing case, then compare the expected and actual state before changing the algorithm.",
            citations=citations,
            confidence=0.52,
            policy_notes=["Code mentor output avoids full solution disclosure unless policy allows it."],
            next_actions=["Explain the failing test.", "Give one more hint."],
        )

    if intent == AIIntent.AUTHORING_PATCH:
        return AuthoringPatch(
            summary=summary,
            patch_markdown=answer,
            changed_blocks=["selection"],
            risk_labels=["review-before-publish"],
            citations=citations,
            confidence=0.58,
            policy_notes=["Patch should be reviewed by an author before publishing."],
            next_actions=["Insert patch.", "Revise tone.", "Simplify language."],
        )

    if intent == AIIntent.RUBRIC_FEEDBACK:
        return RubricFeedbackExplanation(
            summary=summary,
            feedback=answer,
            rubric_criteria=[],
            citations=citations,
            confidence=0.55,
            policy_notes=policy_notes,
            next_actions=["Show rubric criteria.", "Draft a revision plan."],
        )

    if intent == AIIntent.TEACHER_INTERVENTION:
        return TeacherInterventionDraft(
            summary=summary,
            cohort_summary=summary,
            intervention_draft=answer,
            privacy_notes=["Review learner data scope before sending this intervention."],
            citations=citations,
            confidence=0.5,
            policy_notes=["Teacher-facing suggestions require human review."],
            next_actions=["Edit draft.", "Create follow-up task."],
        )

    return TutorAnswer(
        summary=summary,
        content=answer,
        citations=citations,
        confidence=0.65 if citations else 0.5,
        policy_notes=policy_notes
        if citations
        else ["No citations were retrieved; answer may rely on general knowledge."],
        next_actions=next_actions,
    )
