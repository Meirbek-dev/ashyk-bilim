"""Typed schemas for teacher grading and grade-release workflows.

Student answer payloads are canonical AssessmentDraftPatch.answers payloads.
Legacy per-type answer schemas are intentionally absent.
"""
from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from src.db.grading.submissions import ItemFeedback
from src.db.strict_base_model import PydanticStrictBaseModel, coerce_date_to_end_of_day
from src.types import JsonObject


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


class BulkPublishGradesResponse(PydanticStrictBaseModel):
    """Response for publishing held grades."""

    activity_id: int
    published_count: int
    already_published_count: int


class DeadlineExtensionRequest(PydanticStrictBaseModel):
    """Request for extending an activity deadline for selected students."""

    user_uuids: list[str] = Field(min_length=1, max_length=500)
    new_due_at: datetime
    reason: str = ""

    @field_validator("new_due_at", mode="before")
    @classmethod
    def validate_new_due_at(cls, v: object) -> object:
        return coerce_date_to_end_of_day(v)


class BulkActionRead(PydanticStrictBaseModel):
    """Read model for bulk gradebook actions."""

    action_uuid: str
    action_type: str
    status: str
    total_targets: int
    completed_targets: int
    failed_targets: int
    requested_by: int
    requested_at: datetime
    completed_at: datetime | None = None
    payload_json: JsonObject = Field(default_factory=dict)
    result_json: JsonObject = Field(default_factory=dict)
