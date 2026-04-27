from typing import Annotated

from fastapi import APIRouter, Body, Depends, Request, UploadFile

from src.auth.users import get_optional_public_user, get_public_user
from src.db.courses.assignments import (
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
    create_assignment_task,
    create_assignment_with_activity,
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

## ASSIGNMENTS ##


@router.get("/{assignment_uuid}")
async def api_read_assignment(
    assignment_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_optional_public_user)
    ],
    db_session=Depends(get_db_session),
) -> AssignmentRead:
    return await read_assignment(assignment_uuid, current_user, db_session)


@router.get("/activity/{activity_uuid}")
async def api_read_assignment_from_activity(
    activity_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_optional_public_user)
    ],
    db_session=Depends(get_db_session),
) -> AssignmentRead:
    return await read_assignment_from_activity_uuid(activity_uuid, current_user, db_session)


@router.put("/{assignment_uuid}")
async def api_update_assignment(
    assignment_uuid: str,
    assignment_object: AssignmentUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
) -> AssignmentRead:
    return await update_assignment(assignment_uuid, assignment_object, current_user, db_session)


@router.delete("/activity/{activity_uuid}")
async def api_delete_assignment_from_activity(
    activity_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    return await delete_assignment_from_activity_uuid(activity_uuid, current_user, db_session)


## ASSIGNMENT TASKS ##


@router.post("/{assignment_uuid}/tasks")
async def api_create_assignment_tasks(
    assignment_uuid: str,
    assignment_task_object: AssignmentTaskCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    return await create_assignment_task(
        assignment_uuid, assignment_task_object, current_user, db_session
    )


@router.get("/{assignment_uuid}/tasks")
async def api_read_assignment_tasks(
    assignment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    return await read_assignment_tasks(assignment_uuid, current_user, db_session)


@router.get("/task/{assignment_task_uuid}")
async def api_read_assignment_task(
    assignment_task_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    return await read_assignment_task(assignment_task_uuid, current_user, db_session)


@router.put("/{assignment_uuid}/tasks/{assignment_task_uuid}")
async def api_update_assignment_tasks(
    assignment_uuid: str,
    assignment_task_uuid: str,
    assignment_task_object: AssignmentTaskUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    return await update_assignment_task(
        assignment_uuid, assignment_task_uuid, assignment_task_object, current_user, db_session
    )


@router.post("/{assignment_uuid}/tasks/{assignment_task_uuid}/ref_file")
async def api_put_assignment_task_ref_file(
    assignment_uuid: str,
    assignment_task_uuid: str,
    reference_file: UploadFile | None = None,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
):
    """Upload a reference file for an assignment task."""
    return await put_assignment_task_reference_file(
        db_session, assignment_uuid, assignment_task_uuid, current_user, reference_file
    )


@router.post("/{assignment_uuid}/tasks/{assignment_task_uuid}/sub_file")
async def api_put_assignment_task_sub_file(
    assignment_uuid: str,
    assignment_task_uuid: str,
    sub_file: UploadFile | None = None,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
):
    """Upload a submission file for an assignment task."""
    return await put_assignment_task_submission_file(
        db_session, assignment_uuid, assignment_task_uuid, current_user, sub_file
    )


@router.delete("/{assignment_uuid}/tasks/{assignment_task_uuid}")
async def api_delete_assignment_tasks(
    assignment_uuid: str,
    assignment_task_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    return await delete_assignment_task(
        assignment_uuid, assignment_task_uuid, current_user, db_session
    )


## ASSIGNMENT SUBMISSIONS ##


@router.get("/{assignment_uuid}/submissions/me/draft")
async def api_get_assignment_draft_submission(
    assignment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
) -> AssignmentDraftRead:
    """Get the current user's Submission-backed assignment draft, if any."""
    return await get_assignment_draft_submission(assignment_uuid, current_user, db_session)


@router.patch("/{assignment_uuid}/submissions/me/draft")
async def api_save_assignment_draft_submission(
    assignment_uuid: str,
    draft_patch: AssignmentDraftPatch,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
) -> SubmissionRead:
    """Create or update the current user's assignment draft in Submission."""
    return await save_assignment_draft_submission(
        assignment_uuid, draft_patch, current_user, db_session
    )


@router.post("/{assignment_uuid}/submit")
async def api_submit_assignment_draft_submission(
    assignment_uuid: str,
    draft_patch: AssignmentDraftPatch | None = None,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session=Depends(get_db_session),
) -> SubmissionRead:
    """Submit the current user's assignment draft through the unified Submission model."""
    return await submit_assignment_draft_submission(
        assignment_uuid, draft_patch, current_user, db_session
    )


## ASSIGNMENT LISTS ##


@router.get("/course/{course_uuid}")
async def api_get_assignments(
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    return await get_assignments_from_course(course_uuid, current_user, db_session)


@router.post("/courses")
async def api_get_assignments_for_courses(
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
    payload: dict = Body(...),
):
    """Body: { "course_uuids": ["course_xxx", ...] }"""
    course_uuids: list[str] = payload.get("course_uuids", [])
    return await get_assignments_from_courses(course_uuids, current_user, db_session)


@router.post("/courses/editable")
async def api_get_editable_assignments_for_courses(
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
    payload: dict = Body(...),
):
    """Body: { "course_uuids": ["course_xxx", ...] }"""
    course_uuids: list[str] = payload.get("course_uuids", [])
    return await get_editable_assignments_from_courses(course_uuids, current_user, db_session)


@router.post("/with-activity")
async def api_create_assignment_with_activity(
    assignment_object: AssignmentCreateWithActivity,
    chapter_id: int,
    activity_name: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    """Create assignment with activity in a single transaction."""
    return await create_assignment_with_activity(
        assignment_object, current_user, db_session, chapter_id, activity_name
    )
