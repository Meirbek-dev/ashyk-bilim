"""Typed event definitions for the assessment event bus."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from src.db.grading.submissions import AssessmentType


@dataclass(frozen=True, slots=True)
class SubmissionSubmittedEvent:
    """Emitted after a student submission is persisted and committed."""

    submission_uuid: str
    assessment_type: AssessmentType
    user_id: int
    activity_id: int
    attempt_number: int
    final_score: float | None = None
    is_late: bool = False
    violation_count: int = 0
    file_keys: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class GradePublishedEvent:
    """Emitted when a teacher publishes a grade (visible to student)."""

    submission_uuid: str
    user_id: int
    final_score: float
    published_at: datetime
    graded_by: int | None = None


@dataclass(frozen=True, slots=True)
class SubmissionReturnedEvent:
    """Emitted when a teacher returns a submission for revision."""

    submission_uuid: str
    user_id: int
    feedback: str = ""
    returned_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class AssessmentPublishedEvent:
    """Emitted when an assessment transitions to PUBLISHED lifecycle."""

    assessment_uuid: str
    activity_id: int
    published_at: datetime
    published_by: int | None = None


@dataclass(frozen=True, slots=True)
class PolicyOverrideCreatedEvent:
    """Emitted when a teacher creates a per-student policy override."""

    override_id: int
    policy_id: int
    user_id: int
    granted_by: int
    assessment_uuid: str | None = None


@dataclass(frozen=True, slots=True)
class FileSubmissionSubmittedEvent:
    """Emitted after a first-class file submission attempt is submitted."""

    attempt_uuid: str
    file_submission_uuid: str
    user_id: int
    activity_id: int
    attempt_number: int
    is_late: bool = False
    file_keys: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class FileSubmissionGradedEvent:
    """Emitted when a first-class file submission grade draft is saved."""

    attempt_uuid: str
    user_id: int
    final_score: float
    graded_at: datetime
    graded_by: int | None = None


@dataclass(frozen=True, slots=True)
class FileSubmissionPublishedEvent:
    """Emitted when a first-class file submission grade becomes visible."""

    attempt_uuid: str
    user_id: int
    final_score: float
    published_at: datetime
    graded_by: int | None = None


@dataclass(frozen=True, slots=True)
class FileSubmissionReturnedEvent:
    """Emitted when a first-class file submission is returned for revision."""

    attempt_uuid: str
    user_id: int
    feedback: str = ""
    returned_at: datetime | None = None
