"""Canonical learner-facing course state contract."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from src.db.strict_base_model import PydanticStrictBaseModel

LearnerWorkState = Literal[
    "not_started",
    "in_progress",
    "submitted",
    "needs_grading",
    "graded_hidden",
    "returned",
    "passed",
    "failed",
    "complete",
    "locked",
]

LearnerActionId = Literal[
    "enroll",
    "start",
    "continue",
    "revise",
    "view_feedback",
    "wait_for_grade",
    "view_certificate",
    "review_completion",
    "none",
]


class LearnerCourseAction(PydanticStrictBaseModel):
    id: LearnerActionId
    label: str
    reason: str
    enabled: bool = True
    activity_uuid: str | None = None
    href: str | None = None


class LearnerCourseActivityState(PydanticStrictBaseModel):
    id: int
    uuid: str
    title: str
    type: str
    required: bool = True
    state: LearnerWorkState = "not_started"
    complete: bool = False
    score: float | None = None
    passed: bool | None = None
    due_at: datetime | None = None
    is_late: bool = False
    available: bool = True
    blocked_reason: str | None = None
    allowed_actions: list[str] = Field(default_factory=list)


class LearnerCourseChapterState(PydanticStrictBaseModel):
    id: int
    uuid: str
    title: str
    index: int
    activities: list[LearnerCourseActivityState] = Field(default_factory=list)


class LearnerCourseProgressState(PydanticStrictBaseModel):
    completed_required_count: int = 0
    total_required_count: int = 0
    missing_required_count: int = 0
    needs_grading_count: int = 0
    progress_pct: float = 0.0
    grade_average: float | None = None
    completed_at: datetime | None = None


class LearnerCertificateState(PydanticStrictBaseModel):
    configured: bool = False
    eligible: bool = False
    issued: bool = False
    user_certification_uuid: str | None = None
    href: str | None = None


class LearnerCoursePermissions(PydanticStrictBaseModel):
    can_discover: bool
    can_access: bool
    can_enroll: bool
    denial_reason: str | None = None


class LearnerCourseState(PydanticStrictBaseModel):
    course_id: int
    course_uuid: str
    title: str
    public: bool
    enrolled: bool
    enrollment_state: Literal["not_enrolled", "in_progress", "completed"]
    permissions: LearnerCoursePermissions
    progress: LearnerCourseProgressState
    certificate: LearnerCertificateState
    next_action: LearnerCourseAction
    outline: list[LearnerCourseChapterState] = Field(default_factory=list)
