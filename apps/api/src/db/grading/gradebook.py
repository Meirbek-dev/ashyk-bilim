"""Teacher-facing course gradebook response schemas."""

from datetime import datetime
from typing import Literal

from src.db.grading.progress import ActivityProgressState
from src.db.grading.submissions import AssessmentType
from src.db.strict_base_model import PydanticStrictBaseModel


class GradebookActivity(PydanticStrictBaseModel):
    id: int
    activity_uuid: str
    name: str
    activity_type: str
    assessment_type: AssessmentType | None = None
    order: int
    due_at: datetime | None = None


class GradebookStudent(PydanticStrictBaseModel):
    id: int
    user_uuid: str
    username: str
    first_name: str | None = None
    last_name: str | None = None
    email: str


class ActivityProgressCell(PydanticStrictBaseModel):
    user_id: int
    activity_id: int
    state: ActivityProgressState
    score: float | None = None
    passed: bool | None = None
    is_late: bool = False
    teacher_action_required: bool = False
    attempt_count: int = 0
    latest_submission_uuid: str | None = None
    latest_submission_status: str | None = None
    submitted_at: datetime | None = None
    graded_at: datetime | None = None
    completed_at: datetime | None = None
    due_at: datetime | None = None
    status_reason: str | None = None


class TeacherAction(PydanticStrictBaseModel):
    action_type: Literal["GRADE_SUBMISSION"]
    user_id: int
    activity_id: int
    submission_uuid: str
    student_name: str
    activity_name: str
    submitted_at: datetime | None = None
    is_late: bool = False


class GradebookSummary(PydanticStrictBaseModel):
    student_count: int
    activity_count: int
    needs_grading_count: int
    overdue_count: int
    not_started_count: int
    completed_count: int


class CourseGradebookResponse(PydanticStrictBaseModel):
    course_uuid: str
    course_id: int
    course_name: str
    students: list[GradebookStudent]
    activities: list[GradebookActivity]
    cells: list[ActivityProgressCell]
    teacher_actions: list[TeacherAction]
    summary: GradebookSummary
