"""Assignment draft-save and submit lifecycle."""

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlmodel import Session
from ulid import ULID

from src.db.courses.assignments import (
    Assignment,
    AssignmentDraftPatch,
    AssignmentDraftRead,
    AssignmentTask,
    AssignmentTaskAnswer,
)
from src.db.grading.submissions import (
    AssessmentType,
    GradingBreakdown,
    Submission,
    SubmissionRead,
    SubmissionStatus,
)
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses.access import user_has_course_access
from src.services.courses.activities.assignments._queries import (
    _count_previous_assignment_attempts,
    _get_assignment_context,
    _get_assignment_tasks,
    _get_blocking_assignment_submission,
    _get_open_assignment_draft,
)
from src.services.grading.assignment_breakdown import build_assignment_breakdown


# ── Access guard ───────────────────────────────────────────────────────────────


def _require_assignment_submit_access(
    current_user: PublicUser | AnonymousUser,
    course: object,
    db_session: Session,
) -> None:
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")

    if not user_has_course_access(current_user.id, course, db_session):
        raise HTTPException(
            status_code=403,
            detail="You must be enrolled in this course to submit assignments",
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:submit",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )


# ── Answer helpers ─────────────────────────────────────────────────────────────


def _normalize_assignment_answers(
    existing_payload: object,
    patch: AssignmentDraftPatch | None,
) -> dict[str, object]:
    existing = existing_payload if isinstance(existing_payload, dict) else {}
    existing_tasks = existing.get("tasks", [])
    tasks_by_uuid: dict[str, dict[str, object]] = {}

    if isinstance(existing_tasks, list):
        for raw_task in existing_tasks:
            if not isinstance(raw_task, dict):
                continue
            task_uuid = raw_task.get("task_uuid")
            if isinstance(task_uuid, str) and task_uuid:
                tasks_by_uuid[task_uuid] = raw_task

    if patch is not None:
        for task_answer in patch.tasks:
            tasks_by_uuid[task_answer.task_uuid] = task_answer.model_dump(
                exclude_defaults=True,
                exclude_none=True,
            )

    return {**existing, "tasks": list(tasks_by_uuid.values())}


def _validate_assignment_answer_tasks(
    patch: AssignmentDraftPatch | None,
    assignment_tasks: list[AssignmentTask],
) -> None:
    if patch is None:
        return
    allowed_task_uuids = {task.assignment_task_uuid for task in assignment_tasks}
    invalid = [t.task_uuid for t in patch.tasks if t.task_uuid not in allowed_task_uuids]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "One or more task answers do not belong to this assignment",
                "task_uuids": invalid,
            },
        )


# ── Draft creation helper (shared by save and submit) ─────────────────────────


def _get_or_create_draft(
    activity_id: int,
    user_id: int,
    db_session: Session,
    *,
    now: datetime,
) -> Submission:
    draft = _get_open_assignment_draft(activity_id, user_id, db_session)
    if draft:
        return draft
    return Submission(
        submission_uuid=f"submission_{ULID()}",
        assessment_type=AssessmentType.ASSIGNMENT,
        activity_id=activity_id,
        user_id=user_id,
        status=SubmissionStatus.DRAFT,
        attempt_number=_count_previous_assignment_attempts(
            activity_id, user_id, db_session
        )
        + 1,
        answers_json={},
        grading_json={},
        started_at=now,
        created_at=now,
        updated_at=now,
    )


def _assignment_due_deadline(assignment: Assignment) -> datetime | None:
    return assignment.due_at


# ── Public service functions ───────────────────────────────────────────────────


async def get_assignment_draft_submission(
    assignment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> AssignmentDraftRead:
    assignment, activity, course = _get_assignment_context(assignment_uuid, db_session)
    _require_assignment_submit_access(current_user, course, db_session)

    draft = _get_open_assignment_draft(activity.id, current_user.id, db_session)
    return AssignmentDraftRead(
        assignment_uuid=assignment.assignment_uuid,
        submission=SubmissionRead.model_validate(draft) if draft else None,
    )


async def save_assignment_draft_submission(
    assignment_uuid: str,
    draft_patch: AssignmentDraftPatch,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionRead:
    assignment, activity, course = _get_assignment_context(assignment_uuid, db_session)
    _require_assignment_submit_access(current_user, course, db_session)

    blocking = _get_blocking_assignment_submission(activity.id, current_user.id, db_session)
    if blocking:
        raise HTTPException(status_code=409, detail="Assignment has already been submitted")

    assignment_tasks = _get_assignment_tasks(assignment.id, db_session)
    _validate_assignment_answer_tasks(draft_patch, assignment_tasks)

    now = datetime.now(UTC)
    draft = _get_or_create_draft(activity.id, current_user.id, db_session, now=now)
    draft.answers_json = _normalize_assignment_answers(draft.answers_json, draft_patch)
    draft.updated_at = now

    db_session.add(draft)
    db_session.commit()
    db_session.refresh(draft)
    return SubmissionRead.model_validate(draft)


async def submit_assignment_draft_submission(
    assignment_uuid: str,
    draft_patch: AssignmentDraftPatch | None,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionRead:
    assignment, activity, course = _get_assignment_context(assignment_uuid, db_session)
    _require_assignment_submit_access(current_user, course, db_session)

    existing_submitted = _get_blocking_assignment_submission(
        activity.id, current_user.id, db_session
    )
    if existing_submitted:
        return SubmissionRead.model_validate(existing_submitted)

    assignment_tasks = _get_assignment_tasks(assignment.id, db_session)
    _validate_assignment_answer_tasks(draft_patch, assignment_tasks)

    now = datetime.now(UTC)
    draft = _get_or_create_draft(activity.id, current_user.id, db_session, now=now)
    draft.answers_json = _normalize_assignment_answers(draft.answers_json, draft_patch)
    draft.grading_json = build_assignment_breakdown(
        GradingBreakdown(),
        draft.answers_json,
        assignment_tasks,
    ).model_dump()
    draft.status = SubmissionStatus.PENDING
    draft.is_late = (
        deadline := _assignment_due_deadline(assignment)
    ) is not None and now > deadline
    draft.submitted_at = now
    draft.graded_at = None
    draft.updated_at = now

    db_session.add(draft)
    db_session.commit()
    db_session.refresh(draft)
    return SubmissionRead.model_validate(draft)
