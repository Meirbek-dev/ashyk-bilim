from typing import Annotated

from fastapi import APIRouter, Body, Depends, Request, UploadFile

from src.db.courses.assignments import (
    AssignmentCreate,
    AssignmentCreateWithActivity,
    AssignmentRead,
    AssignmentTaskCreate,
    AssignmentTaskSubmissionRead,
    AssignmentTaskSubmissionUpdate,
    AssignmentTaskUpdate,
    AssignmentUpdate,
    AssignmentUserSubmissionRead,
    AssignmentUserSubmissionWithUserRead,
)
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user
from src.services.courses.activities.assignments import (
    create_assignment,
    create_assignment_task,
    create_assignment_with_activity,
    delete_assignment,
    delete_assignment_from_activity_uuid,
    delete_assignment_task,
    delete_assignment_task_submission,
    get_all_assignment_user_submissions,
    get_assignment_user_submission,
    get_assignments_from_course,
    get_assignments_from_courses,
    get_editable_assignments_from_courses,
    handle_assignment_task_submission,
    put_assignment_task_reference_file,
    put_assignment_task_submission_file,
    read_assignment,
    read_assignment_from_activity_uuid,
    read_assignment_task,
    read_assignment_task_submissions,
    read_assignment_tasks,
    read_user_assignment_task_submissions,
    read_user_assignment_task_submissions_me,
    update_assignment,
    update_assignment_task,
    update_assignment_task_submission,
)

router = APIRouter()

## ASSIGNMENTS ##


@router.post("")
async def api_create_assignments(
    request: Request,
    assignment_object: AssignmentCreate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> AssignmentRead:
    """
    Create new activity
    """
    return await create_assignment(request, assignment_object, current_user, db_session)


@router.get("/{assignment_uuid}")
async def api_read_assignment(
    request: Request,
    assignment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> AssignmentRead:
    """
    Read an assignment
    """
    return await read_assignment(request, assignment_uuid, current_user, db_session)


@router.get("/activity/{activity_uuid}")
async def api_read_assignment_from_activity(
    request: Request,
    activity_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> AssignmentRead:
    """
    Read an assignment
    """
    return await read_assignment_from_activity_uuid(
        request, activity_uuid, current_user, db_session
    )


@router.put("/{assignment_uuid}")
async def api_update_assignment(
    request: Request,
    assignment_uuid: str,
    assignment_object: AssignmentUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> AssignmentRead:
    """
    Update an assignment
    """
    return await update_assignment(
        request, assignment_uuid, assignment_object, current_user, db_session
    )


@router.delete("/{assignment_uuid}")
async def api_delete_assignment(
    request: Request,
    assignment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
):
    """
    Delete an assignment
    """
    return await delete_assignment(request, assignment_uuid, current_user, db_session)


@router.delete("/activity/{activity_uuid}")
async def api_delete_assignment_from_activity(
    request: Request,
    activity_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
):
    """
    Delete an assignment
    """
    return await delete_assignment_from_activity_uuid(
        request, activity_uuid, current_user, db_session
    )


## ASSIGNMENTS Tasks ##


@router.post("/{assignment_uuid}/tasks")
async def api_create_assignment_tasks(
    request: Request,
    assignment_uuid: str,
    assignment_task_object: AssignmentTaskCreate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
):
    """
    Create new tasks for an assignment
    """
    return await create_assignment_task(
        request, assignment_uuid, assignment_task_object, current_user, db_session
    )


@router.get("/{assignment_uuid}/tasks")
async def api_read_assignment_tasks(
    request: Request,
    assignment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
):
    """
    Read tasks for an assignment
    """
    return await read_assignment_tasks(
        request, assignment_uuid, current_user, db_session
    )


@router.get("/task/{assignment_task_uuid}")
async def api_read_assignment_task(
    request: Request,
    assignment_task_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
):
    """
    Read task for an assignment
    """
    return await read_assignment_task(
        request, assignment_task_uuid, current_user, db_session
    )


@router.put("/{assignment_uuid}/tasks/{assignment_task_uuid}")
async def api_update_assignment_tasks(
    request: Request,
    assignment_task_uuid: str,
    assignment_task_object: AssignmentTaskUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
):
    """
    Update tasks for an assignment
    """
    return await update_assignment_task(
        request, assignment_task_uuid, assignment_task_object, current_user, db_session
    )


@router.post("/{assignment_uuid}/tasks/{assignment_task_uuid}/ref_file")
async def api_put_assignment_task_ref_file(
    request: Request,
    assignment_task_uuid: str,
    reference_file: UploadFile | None = None,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
):
    """Upload a reference file for an assignment task."""
    return await put_assignment_task_reference_file(
        request, db_session, assignment_task_uuid, current_user, reference_file
    )


@router.post("/{assignment_uuid}/tasks/{assignment_task_uuid}/sub_file")
async def api_put_assignment_task_sub_file(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    sub_file: UploadFile | None = None,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
):
    """Upload a submission file for an assignment task."""
    return await put_assignment_task_submission_file(
        request, db_session, assignment_task_uuid, current_user, sub_file
    )


@router.get("/{assignment_uuid}/tasks/{assignment_task_uuid}/submissions/me")
async def api_get_assignment_task_submission_me(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
):
    """Get the current user's submission for an assignment task."""
    return await read_user_assignment_task_submissions_me(
        request, assignment_task_uuid, current_user, db_session
    )


@router.get(
    "/{assignment_uuid}/tasks/{assignment_task_uuid}/submissions/user/{user_id}"
)
async def api_get_assignment_task_submission_user(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    user_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
):
    """Get a specific user's submission for an assignment task."""
    return await read_user_assignment_task_submissions(
        request, assignment_task_uuid, user_id, current_user, db_session
    )


@router.get("/{assignment_uuid}/tasks/{assignment_task_uuid}/submissions")
async def api_get_assignment_task_submissions(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
) -> list[AssignmentTaskSubmissionRead]:
    """List all submissions for an assignment task."""
    return await read_assignment_task_submissions(
        request, assignment_task_uuid, current_user, db_session
    )


@router.put("/{assignment_uuid}/tasks/{assignment_task_uuid}/submissions")
async def api_handle_assignment_task_submission(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    assignment_task_submission_object: AssignmentTaskSubmissionUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
):
    """Create or update a submission for an assignment task."""
    return await handle_assignment_task_submission(
        request,
        assignment_task_uuid,
        assignment_task_submission_object,
        current_user,
        db_session,
    )


@router.put("/submissions/{assignment_task_submission_uuid}")
async def api_update_assignment_task_submission(
    request: Request,
    assignment_task_submission_uuid: str,
    assignment_task_submission_object: AssignmentTaskSubmissionUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
) -> AssignmentTaskSubmissionRead:
    """Update an assignment task submission."""
    return await update_assignment_task_submission(
        request,
        assignment_task_submission_uuid,
        assignment_task_submission_object,
        current_user,
        db_session,
    )


@router.delete(
    "/{assignment_uuid}/tasks/{assignment_task_uuid}/submissions/{assignment_task_submission_uuid}"
)
async def api_delete_assignment_task_submission(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    assignment_task_submission_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
):
    """Delete an assignment task submission."""
    return await delete_assignment_task_submission(
        request,
        assignment_task_submission_uuid,
        current_user,
        db_session,
    )


@router.delete("/{assignment_uuid}/tasks/{assignment_task_uuid}")
async def api_delete_assignment_tasks(
    request: Request,
    assignment_task_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
):
    """
    Delete tasks for an assignment
    """
    return await delete_assignment_task(
        request, assignment_task_uuid, current_user, db_session
    )


@router.get("/{assignment_uuid}/submissions/me")
async def api_get_assignment_submission_me(
    request: Request,
    assignment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
) -> AssignmentUserSubmissionRead:
    """Get the current user's assignment-level submission status."""
    return await get_assignment_user_submission(
        request,
        assignment_uuid,
        current_user.id,
        current_user,
        db_session,
    )


@router.get("/{assignment_uuid}/submissions")
async def api_get_assignment_submissions(
    request: Request,
    assignment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
) -> list[AssignmentUserSubmissionWithUserRead]:
    """Get assignment-level submission statuses for all course learners."""
    return await get_all_assignment_user_submissions(
        request,
        assignment_uuid,
        current_user,
        db_session,
    )


@router.get("/{assignment_uuid}/submissions/{user_id}")
async def api_get_assignment_submission_user(
    request: Request,
    assignment_uuid: str,
    user_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db_session=Depends(get_db_session),
) -> AssignmentUserSubmissionRead:
    """Get a specific user's assignment-level submission status."""
    return await get_assignment_user_submission(
        request,
        assignment_uuid,
        user_id,
        current_user,
        db_session,
    )


@router.get("/course/{course_uuid}")
async def api_get_assignments(
    request: Request,
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
):
    """
    Get assignments for a course
    """
    return await get_assignments_from_course(
        request, course_uuid, current_user, db_session
    )


@router.post("/courses")
async def api_get_assignments_for_courses(
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
    payload: dict = Body(...),
):
    """
    Get assignments for multiple courses in a single request.
    Body: { "course_uuids": ["course_xxx", ...] }
    Returns a mapping course_uuid -> list of assignments.
    """
    course_uuids: list[str] = payload.get("course_uuids", [])
    return await get_assignments_from_courses(
        request, course_uuids, current_user, db_session
    )


@router.post("/courses/editable")
async def api_get_editable_assignments_for_courses(
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
    payload: dict = Body(...),
):
    """
    Get assignments the current user can edit for multiple courses.
    Body: { "course_uuids": ["course_xxx", ...] }
    Returns a mapping course_uuid -> list of assignments.
    Only includes courses/assignments where the user has assignment:update permission.
    """
    course_uuids: list[str] = payload.get("course_uuids", [])
    return await get_editable_assignments_from_courses(
        request, course_uuids, current_user, db_session
    )


@router.post("/with-activity")
async def api_create_assignment_with_activity(
    request: Request,
    assignment_object: AssignmentCreateWithActivity,
    chapter_id: int,
    activity_name: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
):
    """
    Create assignment with activity in a single transaction for better performance
    """
    return await create_assignment_with_activity(
        request, assignment_object, current_user, db_session, chapter_id, activity_name
    )
