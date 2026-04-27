from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Request, UploadFile, status

from src.auth.users import get_optional_public_user, get_public_user
from src.db.courses.assignments import (
    AssignmentCreate,
    AssignmentCreateWithActivity,
    AssignmentDraftPatch,
    AssignmentDraftRead,
    AssignmentRead,
    AssignmentTaskCreate,
    AssignmentTaskUpdate,
    AssignmentUpdate,
)
from src.db.grading.submissions import SubmissionRead
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.services.courses.activities.assignments import (
    create_assignment,
    create_assignment_task,
    create_assignment_with_activity,
    delete_assignment,
    delete_assignment_from_activity_uuid,
    delete_assignment_task,
    get_assignment_draft_submission,
    get_assignments_from_course,
    get_assignments_from_courses,
    get_editable_assignments_from_courses,
    put_assignment_task_reference_file,
    put_assignment_task_submission_file,
    read_assignment,
    read_assignment_from_activity_uuid,
    read_assignment_task,
    read_assignment_tasks,
    save_assignment_draft_submission,
    submit_assignment_draft_submission,
    update_assignment,
    update_assignment_task,
)

router = APIRouter()


def _legacy_assignment_submission_endpoint_disabled() -> None:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Legacy assignment task submission endpoints are disabled. "
            "Use /assignments/{assignment_uuid}/submissions/me/draft and "
            "/assignments/{assignment_uuid}/submit."
        ),
    )

## ASSIGNMENTS ##


@router.post("")
async def api_create_assignments(
    request: Request,
    assignment_object: AssignmentCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_optional_public_user)
    ],
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
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_optional_public_user)
    ],
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
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
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
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
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
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
):
    """Get the current user's submission for an assignment task."""
    _legacy_assignment_submission_endpoint_disabled()


@router.get(
    "/{assignment_uuid}/tasks/{assignment_task_uuid}/submissions/user/{user_id}"
)
async def api_get_assignment_task_submission_user(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    user_id: int,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
):
    """Get a specific user's submission for an assignment task."""
    _legacy_assignment_submission_endpoint_disabled()


@router.get("/{assignment_uuid}/tasks/{assignment_task_uuid}/submissions")
async def api_get_assignment_task_submissions(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
) -> None:
    """List all submissions for an assignment task."""
    _legacy_assignment_submission_endpoint_disabled()


@router.put("/{assignment_uuid}/tasks/{assignment_task_uuid}/submissions")
async def api_handle_assignment_task_submission(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    assignment_task_submission_object: dict | None = Body(default=None),
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
):
    """Create or update a submission for an assignment task."""
    _legacy_assignment_submission_endpoint_disabled()


@router.put("/submissions/{assignment_task_submission_uuid}")
async def api_update_assignment_task_submission(
    request: Request,
    assignment_task_submission_uuid: str,
    assignment_task_submission_object: dict | None = Body(default=None),
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
) -> None:
    """Update an assignment task submission."""
    _legacy_assignment_submission_endpoint_disabled()


@router.delete(
    "/{assignment_uuid}/tasks/{assignment_task_uuid}/submissions/{assignment_task_submission_uuid}"
)
async def api_delete_assignment_task_submission(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    assignment_task_submission_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
):
    """Delete an assignment task submission."""
    _legacy_assignment_submission_endpoint_disabled()


@router.delete("/{assignment_uuid}/tasks/{assignment_task_uuid}")
async def api_delete_assignment_tasks(
    request: Request,
    assignment_task_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    """
    Delete tasks for an assignment
    """
    return await delete_assignment_task(
        request, assignment_task_uuid, current_user, db_session
    )


@router.get("/{assignment_uuid}/submissions/me/draft")
async def api_get_assignment_draft_submission(
    request: Request,
    assignment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
) -> AssignmentDraftRead:
    """Get the current user's Submission-backed assignment draft, if any."""
    return await get_assignment_draft_submission(
        request,
        assignment_uuid,
        current_user,
        db_session,
    )


@router.patch("/{assignment_uuid}/submissions/me/draft")
async def api_save_assignment_draft_submission(
    request: Request,
    assignment_uuid: str,
    draft_patch: AssignmentDraftPatch,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
) -> SubmissionRead:
    """Create or update the current user's assignment draft in Submission."""
    return await save_assignment_draft_submission(
        request,
        assignment_uuid,
        draft_patch,
        current_user,
        db_session,
    )


@router.post("/{assignment_uuid}/submit")
async def api_submit_assignment_draft_submission(
    request: Request,
    assignment_uuid: str,
    draft_patch: AssignmentDraftPatch | None = None,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
) -> SubmissionRead:
    """Submit the current user's assignment draft through the unified Submission model."""
    return await submit_assignment_draft_submission(
        request,
        assignment_uuid,
        draft_patch,
        current_user,
        db_session,
    )


@router.get("/{assignment_uuid}/submissions/me")
async def api_get_assignment_submission_me(
    request: Request,
    assignment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
) -> None:
    """Get the current user's assignment-level submission status."""
    _legacy_assignment_submission_endpoint_disabled()


@router.get("/{assignment_uuid}/submissions")
async def api_get_assignment_submissions(
    request: Request,
    assignment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
) -> None:
    """Get assignment-level submission statuses for all course learners."""
    _legacy_assignment_submission_endpoint_disabled()


@router.get("/{assignment_uuid}/submissions/{user_id}")
async def api_get_assignment_submission_user(
    request: Request,
    assignment_uuid: str,
    user_id: int,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
) -> None:
    """Get a specific user's assignment-level submission status."""
    _legacy_assignment_submission_endpoint_disabled()


@router.get("/course/{course_uuid}")
async def api_get_assignments(
    request: Request,
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    """
    Create assignment with activity in a single transaction for better performance
    """
    return await create_assignment_with_activity(
        request, assignment_object, current_user, db_session, chapter_id, activity_name
    )
