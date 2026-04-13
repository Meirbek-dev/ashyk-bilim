"""
Typed Pydantic schemas for submission answer payloads.

Each assessment type owns its own typed payload so the grader receives
clean, validated inputs rather than opaque JSON blobs.

Teacher grading input (TeacherGradeInput, ItemFeedback) lives in
submissions.py alongside the models it operates on.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from src.db.grading.submissions import ItemFeedback
from src.db.strict_base_model import PydanticStrictBaseModel

# ── Quiz ──────────────────────────────────────────────────────────────────────


class QuizAnswer(PydanticStrictBaseModel):
    """A student's answer to one quiz question."""

    question_id: str
    selected_option_ids: list[str] = Field(default_factory=list)
    text_answer: str | None = None  # For custom_answer type questions


class QuizAnswers(PydanticStrictBaseModel):
    """Complete quiz submission payload."""

    answers: list[QuizAnswer]
    started_at: datetime  # Server-stamped when student clicks "Start"
    submitted_at: datetime  # Server-stamped on receipt — NOT client-provided


# ── Assignment ────────────────────────────────────────────────────────────────


class AssignmentTaskAnswer(PydanticStrictBaseModel):
    """A student's response to one assignment task."""

    task_uuid: str
    content_type: Literal["file", "text", "form"]
    file_key: str | None = None  # Storage key for uploaded file
    text_content: str | None = None  # For text answers
    form_data: dict[str, Any] | None = None  # For form-type tasks


class AssignmentAnswers(PydanticStrictBaseModel):
    """Complete assignment submission payload."""

    tasks: list[AssignmentTaskAnswer]


# ── Exam ──────────────────────────────────────────────────────────────────────


class ExamQuestionAnswer(PydanticStrictBaseModel):
    """A student's answer to one exam question."""

    question_id: int
    selected_option_ids: list[str] = Field(default_factory=list)
    text_answer: str | None = None


class ExamSubmissionPayload(PydanticStrictBaseModel):
    """Complete exam submission payload.

    submitted_answers is a mapping of question_id → answer dict so the
    exam grader can look up answers by question ID without scanning a list.
    """

    submitted_answers: dict[int, ExamQuestionAnswer] = Field(default_factory=dict)
    started_at: datetime
    submitted_at: datetime


# ── Code challenge ────────────────────────────────────────────────────────────


class TestCaseResult(PydanticStrictBaseModel):
    """Result of a single test case execution."""

    test_id: str
    passed: bool
    weight: float = 1.0
    description: str = ""
    message: str = ""


class CodeChallengeSubmissionPayload(PydanticStrictBaseModel):
    """Complete code-challenge submission payload."""

    test_results: list[TestCaseResult] = Field(default_factory=list)
    code_strategy: Literal[
        "BEST_SUBMISSION",
        "ALL_OR_NOTHING",
        "LATEST_SUBMISSION",
        "PARTIAL_CREDIT",
    ] = "BEST_SUBMISSION"
    source_code: str | None = None  # Stored for teacher review, not graded directly


# ── Teacher batch grading ────────────────────────────────────────────────────


class BatchGradeItem(PydanticStrictBaseModel):
    """Single submission grade payload for batch teacher grading."""

    submission_uuid: str
    final_score: float = Field(..., ge=0, le=100)
    status: Literal["GRADED", "PUBLISHED", "RETURNED"]
    feedback: str | None = None
    item_feedback: list[ItemFeedback] | None = None


class BatchGradeRequest(PydanticStrictBaseModel):
    """Batch teacher grading request."""

    grades: list[BatchGradeItem] = Field(min_length=1, max_length=100)


class BatchGradeResultItem(PydanticStrictBaseModel):
    """Per-submission batch grading result."""

    submission_uuid: str
    success: bool
    error: str | None = None


class BatchGradeResponse(PydanticStrictBaseModel):
    """Batch teacher grading response."""

    results: list[BatchGradeResultItem] = Field(default_factory=list)
    succeeded: int = 0
    failed: int = 0
