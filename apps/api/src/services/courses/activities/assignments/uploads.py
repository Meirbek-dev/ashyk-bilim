"""Assignment task file upload handlers."""

from datetime import UTC, datetime

from fastapi import HTTPException, UploadFile
from sqlmodel import Session
from ulid import ULID

from src.db.courses.assignments import AssignmentTaskRead
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses.access import user_has_course_access
from src.services.courses.activities.assignments._queries import (
    _get_assignment_task_context,
)
from src.services.courses.activities.uploads.sub_file import upload_submission_file
from src.services.courses.activities.uploads.tasks_ref_files import upload_reference_file


async def put_assignment_task_reference_file(
    db_session: Session,
    assignment_uuid: str,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    reference_file: UploadFile | None = None,
) -> AssignmentTaskRead:
    assignment_task, assignment, activity, course = _get_assignment_task_context(
        assignment_uuid, assignment_task_uuid, db_session
    )

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    if reference_file and reference_file.filename:
        ext = reference_file.filename.split(".")[-1]
        name_in_disk = f"{assignment_task_uuid}{ULID()}.{ext}"
        await upload_reference_file(
            reference_file,
            name_in_disk,
            activity.activity_uuid,
            course.course_uuid,
            assignment.assignment_uuid,
            assignment_task_uuid,
        )
        assignment_task.reference_file = name_in_disk

    assignment_task.updated_at = datetime.now(UTC)
    db_session.add(assignment_task)
    db_session.commit()
    db_session.refresh(assignment_task)
    return AssignmentTaskRead.model_validate(assignment_task)


async def put_assignment_task_submission_file(
    db_session: Session,
    assignment_uuid: str,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    sub_file: UploadFile | None = None,
) -> dict[str, str]:
    assignment_task, assignment, activity, course = _get_assignment_task_context(
        assignment_uuid, assignment_task_uuid, db_session
    )

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    if not user_has_course_access(current_user.id, course, db_session):
        raise HTTPException(
            status_code=403,
            detail="You must be enrolled in this course to submit files",
        )

    if not sub_file or not sub_file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = sub_file.filename.split(".")[-1]
    name_in_disk = f"{assignment_task_uuid}_sub_{current_user.email}_{ULID()}.{ext}"
    await upload_submission_file(
        sub_file,
        name_in_disk,
        activity.activity_uuid,
        course.course_uuid,
        assignment.assignment_uuid,
        assignment_task_uuid,
    )
    return {"file_uuid": name_in_disk}
