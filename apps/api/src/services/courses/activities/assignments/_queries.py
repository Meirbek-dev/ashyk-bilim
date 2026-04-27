"""Internal DB query helpers for the assignments service package.

All functions are private (prefixed with ``_``) and only called from within
this package. They raise ``HTTPException`` on missing rows so callers don't
repeat the 404 boilerplate.
"""

from fastapi import HTTPException
from sqlmodel import Session, select

from src.db.courses.activities import Activity
from src.db.courses.assignments import Assignment, AssignmentTask
from src.db.courses.courses import Course
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus


# ── Context loaders ────────────────────────────────────────────────────────────


def _get_assignment_context(
    assignment_uuid: str,
    db_session: Session,
) -> tuple[Assignment, Activity, Course]:
    assignment = db_session.exec(
        select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    activity = db_session.exec(
        select(Activity).where(Activity.id == assignment.activity_id)
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    course_id = activity.course_id or assignment.course_id
    course = db_session.exec(select(Course).where(Course.id == course_id)).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    return assignment, activity, course


def _get_assignment_task_context(
    assignment_uuid: str,
    assignment_task_uuid: str,
    db_session: Session,
) -> tuple[AssignmentTask, Assignment, Activity, Course]:
    assignment, activity, course = _get_assignment_context(assignment_uuid, db_session)
    assignment_task = db_session.exec(
        select(AssignmentTask).where(
            AssignmentTask.assignment_task_uuid == assignment_task_uuid
        )
    ).first()
    if not assignment_task:
        raise HTTPException(status_code=404, detail="Assignment Task not found")
    if assignment_task.assignment_id != assignment.id:
        raise HTTPException(
            status_code=404,
            detail="Assignment task does not belong to this assignment",
        )
    return assignment_task, assignment, activity, course


# ── Task queries ───────────────────────────────────────────────────────────────


def _get_assignment_tasks(
    assignment_id: int,
    db_session: Session,
) -> list[AssignmentTask]:
    return db_session.exec(
        select(AssignmentTask)
        .where(AssignmentTask.assignment_id == assignment_id)
        .order_by(AssignmentTask.order, AssignmentTask.id)
    ).all()


# ── Submission queries ─────────────────────────────────────────────────────────


def _get_open_assignment_draft(
    activity_id: int,
    user_id: int,
    db_session: Session,
) -> Submission | None:
    return db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity_id,
            Submission.user_id == user_id,
            Submission.assessment_type == AssessmentType.ASSIGNMENT,
            Submission.status == SubmissionStatus.DRAFT,
        )
    ).first()


def _get_blocking_assignment_submission(
    activity_id: int,
    user_id: int,
    db_session: Session,
) -> Submission | None:
    """Return a non-draft submission that prevents a new draft from being created."""
    return db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity_id,
            Submission.user_id == user_id,
            Submission.assessment_type == AssessmentType.ASSIGNMENT,
            Submission.status.in_([
                SubmissionStatus.PENDING,
                SubmissionStatus.GRADED,
                SubmissionStatus.PUBLISHED,
            ]),
        )
    ).first()


def _count_previous_assignment_attempts(
    activity_id: int,
    user_id: int,
    db_session: Session,
) -> int:
    return len(
        db_session.exec(
            select(Submission).where(
                Submission.activity_id == activity_id,
                Submission.user_id == user_id,
                Submission.assessment_type == AssessmentType.ASSIGNMENT,
                Submission.status != SubmissionStatus.DRAFT,
            )
        ).all()
    )
