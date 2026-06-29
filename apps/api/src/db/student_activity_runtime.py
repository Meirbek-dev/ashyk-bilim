"""Student activity runtime contracts.

These schemas are the canonical API shape for the learner workspace.  They are
intentionally independent from editor, assessment, and file-submission internals
so the frontend can render one stable activity shell.
"""

from datetime import datetime
from typing import Literal

from pydantic import Field

from src.db.grading.progress import ActivityProgressState
from src.db.strict_base_model import PydanticStrictBaseModel
from src.types import JsonObject

StudentActivityState = Literal[
    "not_started",
    "in_progress",
    "viewed",
    "draft",
    "submitted",
    "needs_grading",
    "graded_hidden",
    "published",
    "returned",
    "passed",
    "failed",
    "complete",
    "locked",
    "unavailable",
    "attempt_exhausted",
    "course_end",
]

StudentPrimaryActionId = Literal[
    "start",
    "continue",
    "mark_complete",
    "unmark_complete",
    "submit",
    "view_receipt",
    "view_feedback",
    "revise",
    "next_activity",
    "review_policy",
    "back_to_course",
    "none",
]


class StudentActivityCourseHeader(PydanticStrictBaseModel):
    id: int
    uuid: str
    title: str
    public: bool


class StudentActivityHeader(PydanticStrictBaseModel):
    id: int
    uuid: str
    title: str
    type: str
    subtype: str
    published: bool
    chapter_id: int
    chapter_title: str | None = None
    order: int = 0


class StudentActivityProgressRuntime(PydanticStrictBaseModel):
    state: StudentActivityState
    canonical_state: ActivityProgressState | None = None
    complete: bool = False
    score: float | None = None
    passed: bool | None = None
    due_at: datetime | None = None
    is_late: bool = False
    teacher_action_required: bool = False
    attempt_count: int = 0
    latest_submission_uuid: str | None = None
    latest_submission_status: str | None = None
    submitted_at: datetime | None = None
    graded_at: datetime | None = None
    completed_at: datetime | None = None
    status_reason: str | None = None


class StudentVisiblePolicy(PydanticStrictBaseModel):
    due_at: datetime | None = None
    max_attempts: int | None = None
    passing_score: float | None = None
    grade_release_mode: str | None = None
    grading_mode: str | None = None
    completion_rule: str | None = None
    time_limit_seconds: int | None = None


class StudentPrimaryAction(PydanticStrictBaseModel):
    id: StudentPrimaryActionId
    enabled: bool
    reason: str | None = None
    target_activity_uuid: str | None = None


class StudentActivityPermissions(PydanticStrictBaseModel):
    is_authenticated: bool
    can_view: bool
    can_contribute: bool = False
    can_update: bool = False


class StudentActivityContentRuntime(PydanticStrictBaseModel):
    type: str
    subtype: str
    content: JsonObject = Field(default_factory=dict)
    details: JsonObject = Field(default_factory=dict)
    settings: JsonObject = Field(default_factory=dict)
    assessment_uuid: str | None = None
    file_submission_uuid: str | None = None


class StudentActivityNavItem(PydanticStrictBaseModel):
    id: int
    uuid: str
    title: str
    type: str
    published: bool
    complete: bool = False
    state: StudentActivityState = "not_started"


class StudentActivityOutlineChapter(PydanticStrictBaseModel):
    id: int
    title: str
    index: int
    activities: list[StudentActivityNavItem] = Field(default_factory=list)


class StudentActivityRuntime(PydanticStrictBaseModel):
    course: StudentActivityCourseHeader
    activity: StudentActivityHeader | None
    content: StudentActivityContentRuntime | None
    outline: list[StudentActivityOutlineChapter] = Field(default_factory=list)
    progress: StudentActivityProgressRuntime
    policy: StudentVisiblePolicy | None = None
    permissions: StudentActivityPermissions
    primary_action: StudentPrimaryAction
    previous: StudentActivityNavItem | None = None
    next: StudentActivityNavItem | None = None


class StudentActivityActionRequest(PydanticStrictBaseModel):
    command: Literal[
        "start",
        "mark_viewed",
        "mark_complete",
        "unmark_complete",
        "start_attempt",
        "save_draft",
        "submit",
        "request_revision_start",
        "acknowledge_feedback",
    ]
    payload: JsonObject = Field(default_factory=dict)
