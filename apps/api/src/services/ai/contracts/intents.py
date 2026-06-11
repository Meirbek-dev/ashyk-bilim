"""AI intent contracts for LMS product actions."""

from enum import StrEnum


class AIIntent(StrEnum):
    FREEFORM = "freeform"
    TUTOR_ANSWER = "tutor_answer"
    FLASHCARDS = "flashcards"
    HINT_LADDER = "hint_ladder"
    CODE_REVIEW_HINT = "code_review_hint"
    AUTHORING_PATCH = "authoring_patch"
    RUBRIC_FEEDBACK = "rubric_feedback"
    TEACHER_INTERVENTION = "teacher_intervention"


def normalize_ai_intent(value: str | AIIntent | None) -> AIIntent:
    if isinstance(value, AIIntent):
        return value
    if not value:
        return AIIntent.FREEFORM
    normalized = value.strip().lower().replace("-", "_")
    for intent in AIIntent:
        if intent.value == normalized:
            return intent
    return AIIntent.FREEFORM
