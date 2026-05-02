from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, UploadFile
from fastapi.responses import RedirectResponse
from sqlmodel import Session, select

from src.auth.users import get_optional_public_user, get_public_user
from src.db.assessments import Assessment, AssessmentDraftPatch as UnifiedAssessmentDraftPatch
from src.db.courses.assignments import (
    Assignment,
    AssignmentCreateWithActivity,
    AssignmentDraftPatch,
    AssignmentDraftRead,
    AssignmentPublishInput,
    AssignmentRead,
    AssignmentTaskCreate,
    AssignmentTaskUpdate,
    AssignmentUpdate,
)
from src.db.grading.submissions import SubmissionRead
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.services.assessments.core import (
    get_my_assessment_draft as get_unified_assessment_draft,
    save_assessment_draft as save_unified_assessment_draft,
    submit_assessment as submit_unified_assessment,
)
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
from src.services.courses.assignment_lifecycle import (
    archive_assignment,
    cancel_schedule,
    publish_assignment,
)

router = APIRouter()


def _assessment_uuid_for_assignment(assignment_uuid: str, db_session: Session) -> str | None:
    """Return the canonical assessment_uuid for an assignment, or None if not found."""
    assignment = db_session.exec(
        select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    ).first()
    if assignment is None:
        return None
    assessment = db_session.exec(
        select(Assessment).where(Assessment.activity_id == assignment.activity_id)
    ).first()
    return assessment.assessment_uuid if assessment else None


def _assignment_patch_to_unified_patch(
    draft_patch: AssignmentDraftPatch | None,
) -> UnifiedAssessmentDraftPatch | None:
    if draft_patch is None:
        return None

    return UnifiedAssessmentDraftPatch(
        answers=[
            {
                "item_uuid": task.task_uuid,
                "answer": _assignment_task_answer_to_unified_answer(task),
            }
            for task in draft_patch.tasks
        ]
    )


def _assignment_task_answer_to_unified_answer(task: object) -> dict[str, object]:
    content_type = getattr(task, "content_type", None)

    if content_type == "file":
        file_key = getattr(task, "file_key", None)
        return {
            "kind": "FILE_UPLOAD",
            "uploads": [{"upload_uuid": file_key}] if isinstance(file_key, str) and file_key else [],
        }

    if content_type == "form":
        form_data = getattr(task, "form_data", None)
        answers = form_data.get("answers", {}) if isinstance(form_data, dict) else {}
        return {
            "kind": "FORM",
            "values": {
                str(key): value
                for key, value in answers.items()
                if isinstance(value, str)
            } if isinstance(answers, dict) else {},
        }

    if content_type == "quiz":
        quiz_answers = getattr(task, "quiz_answers", None)
        raw_answers = quiz_answers.get("answers", {}) if isinstance(quiz_answers, dict) else {}
        selected: list[str] = []
        if isinstance(raw_answers, dict):
            for raw_selected in raw_answers.values():
                if not isinstance(raw_selected, list):
                    continue
                for option_id in raw_selected:
                    if isinstance(option_id, str) and option_id not in selected:
                        selected.append(option_id)
        return {
            "kind": "CHOICE",
            "selected": selected,
        }

    text_content = getattr(task, "text_content", None)
    return {
        "kind": "OPEN_TEXT",
        "text": text_content if isinstance(text_content, str) else "",
    }


def _assignment_draft_read_from_unified(
    assignment_uuid: str,
    unified_draft: object,
) -> AssignmentDraftRead:
    submission = getattr(unified_draft, "submission", None)
    return AssignmentDraftRead(
        assignment_uuid=assignment_uuid,
        submission=submission,
    )

# ASSIGNMENTS ##


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
    return await read_assignment_from_activity_uuid(
        activity_uuid, current_user, db_session
    )


@router.put("/{assignment_uuid}")
async def api_update_assignment(
    assignment_uuid: str,
    assignment_object: AssignmentUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
) -> AssignmentRead:
    return await update_assignment(
        assignment_uuid, assignment_object, current_user, db_session
    )


@router.post("/{assignment_uuid}/publish")
async def api_publish_assignment(
    assignment_uuid: str,
    publish_input: AssignmentPublishInput,
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssignmentRead:
    """Publish immediately or schedule for a future date.

    Body ``scheduled_at`` is optional:
    - Omit or set to null → publish now (status becomes PUBLISHED).
    - Set to a future datetime → schedule (status becomes SCHEDULED).

    **Deprecated** — use ``POST /api/v1/assessments/{assessment_uuid}/lifecycle`` instead.
    This endpoint will redirect (308) to the canonical URL when possible.
    """
    assessment_uuid = _assessment_uuid_for_assignment(assignment_uuid, db_session)
    if assessment_uuid:
        canonical = str(request.url).replace(
            f"/assignments/{assignment_uuid}/publish",
            f"/assessments/{assessment_uuid}/lifecycle",
        )
        return RedirectResponse(url=canonical, status_code=308)
    return await publish_assignment(
        assignment_uuid, publish_input, current_user, db_session
    )


@router.post("/{assignment_uuid}/archive")
async def api_archive_assignment(
    assignment_uuid: str,
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssignmentRead:
    """Archive an assignment.  Read-only for everyone afterwards; not deletable.

    **Deprecated** — use ``POST /api/v1/assessments/{assessment_uuid}/lifecycle`` instead.
    """
    assessment_uuid = _assessment_uuid_for_assignment(assignment_uuid, db_session)
    if assessment_uuid:
        canonical = str(request.url).replace(
            f"/assignments/{assignment_uuid}/archive",
            f"/assessments/{assessment_uuid}/lifecycle",
        )
        return RedirectResponse(url=canonical, status_code=308)
    return await archive_assignment(assignment_uuid, current_user, db_session)


@router.post("/{assignment_uuid}/cancel-schedule")
async def api_cancel_assignment_schedule(
    assignment_uuid: str,
    request: Request,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssignmentRead:
    """Revert a SCHEDULED assignment back to DRAFT.

    **Deprecated** — use ``POST /api/v1/assessments/{assessment_uuid}/lifecycle`` instead.
    """
    assessment_uuid = _assessment_uuid_for_assignment(assignment_uuid, db_session)
    if assessment_uuid:
        canonical = str(request.url).replace(
            f"/assignments/{assignment_uuid}/cancel-schedule",
            f"/assessments/{assessment_uuid}/lifecycle",
        )
        return RedirectResponse(url=canonical, status_code=308)
    return await cancel_schedule(assignment_uuid, current_user, db_session)


@router.delete("/activity/{activity_uuid}")
async def api_delete_assignment_from_activity(
    activity_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    return await delete_assignment_from_activity_uuid(
        activity_uuid, current_user, db_session
    )


# ASSIGNMENT TASKS ##


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


@router.get("/{assignment_uuid}/tasks/{assignment_task_uuid}")
async def api_read_assignment_task(
    assignment_uuid: str,
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
        assignment_uuid,
        assignment_task_uuid,
        assignment_task_object,
        current_user,
        db_session,
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


# ASSIGNMENT SUBMISSIONS ##


@router.get("/{assignment_uuid}/submissions/me/draft")
async def api_get_assignment_draft_submission(
    assignment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session: Annotated[Session, Depends(get_db_session)] = None,
) -> AssignmentDraftRead:
    """Get the current user's Submission-backed assignment draft, if any.

    **Deprecated** — compatibility adapter over ``GET /api/v1/assessments/{assessment_uuid}/draft``.
    """
    assessment_uuid = _assessment_uuid_for_assignment(assignment_uuid, db_session)
    if assessment_uuid:
        return _assignment_draft_read_from_unified(
            assignment_uuid,
            await get_unified_assessment_draft(
                assessment_uuid,
                current_user,
                db_session,
            ),
        )
    return await get_assignment_draft_submission(
        assignment_uuid, current_user, db_session
    )


@router.patch("/{assignment_uuid}/submissions/me/draft")
async def api_save_assignment_draft_submission(
    assignment_uuid: str,
    draft_patch: AssignmentDraftPatch,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session: Annotated[Session, Depends(get_db_session)] = None,
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> SubmissionRead:
    """Create or update the current user's assignment draft in Submission.

    **Deprecated** — compatibility adapter over ``PATCH /api/v1/assessments/{assessment_uuid}/draft``.
    """
    assessment_uuid = _assessment_uuid_for_assignment(assignment_uuid, db_session)
    if assessment_uuid:
        unified_patch = _assignment_patch_to_unified_patch(draft_patch)
        return await save_unified_assessment_draft(
            assessment_uuid,
            unified_patch or UnifiedAssessmentDraftPatch(),
            current_user,
            db_session,
            if_match=if_match,
        )
    return await save_assignment_draft_submission(
        assignment_uuid, draft_patch, current_user, db_session, if_match=if_match
    )


@router.post("/{assignment_uuid}/submit")
async def api_submit_assignment_draft_submission(
    assignment_uuid: str,
    draft_patch: AssignmentDraftPatch | None = None,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session: Annotated[Session, Depends(get_db_session)] = None,
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> SubmissionRead:
    """Submit the current user's assignment draft through the unified Submission model.

    **Deprecated** — compatibility adapter over ``POST /api/v1/assessments/{assessment_uuid}/submit``.
    """
    assessment_uuid = _assessment_uuid_for_assignment(assignment_uuid, db_session)
    if assessment_uuid:
        return await submit_unified_assessment(
            assessment_uuid,
            _assignment_patch_to_unified_patch(draft_patch),
            current_user,
            db_session,
            if_match=if_match,
        )
    return await submit_assignment_draft_submission(
        assignment_uuid, draft_patch, current_user, db_session, if_match=if_match
    )


# ASSIGNMENT LISTS ##


@router.get("/course/{course_uuid}")
async def api_get_assignments(
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
):
    return await get_assignments_from_course(course_uuid, current_user, db_session)


@router.get("/courses")
async def api_get_assignments_for_courses(
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
    course_uuids: Annotated[list[str] | None, Query()] = None,
):
    if course_uuids is None:
        course_uuids = []
    return await get_assignments_from_courses(course_uuids, current_user, db_session)


@router.get("/courses/editable")
async def api_get_editable_assignments_for_courses(
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session=Depends(get_db_session),
    course_uuids: Annotated[list[str] | None, Query()] = None,
):
    if course_uuids is None:
        course_uuids = []
    return await get_editable_assignments_from_courses(
        course_uuids, current_user, db_session
    )


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
