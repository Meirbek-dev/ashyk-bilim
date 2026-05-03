"""Unified assessment routes.

These are the canonical verbs for authoring, lifecycle, attempts, drafts, and
teacher submission lists.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, Query, UploadFile
from fastapi.responses import Response
from sqlmodel import Session

from src.auth.users import get_optional_public_user, get_public_user
from src.db.assessment_contracts import (
    AssignmentTaskCreate,
    AssignmentTaskRead,
    AssignmentTaskUpdate,
    QuestionCreate,
    QuestionRead,
    QuestionUpdate,
)
from src.db.assessments import (
    AssessmentCreate,
    AssessmentDraftPatch,
    AssessmentDraftRead,
    AssessmentItemCreate,
    AssessmentItemReorder,
    AssessmentItemUpdate,
    AssessmentLifecycleTransition,
    AssessmentRead,
    AssessmentReadiness,
    AssessmentReadItem,
    AssessmentUpdate,
)
from src.db.grading.submissions import SubmissionListResponse, SubmissionRead
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.services.assessments.authoring import (
    create_assignment_task,
    create_exam_question,
    delete_assignment_task,
    delete_exam_question,
    exam_authoring_config,
    export_exam_questions_csv,
    get_assignment_task,
    import_exam_questions_csv,
    list_assignment_tasks,
    list_exam_questions,
    reorder_exam_questions,
    update_assignment_task,
    update_exam_question,
)
from src.services.assessments.core import (
    check_publish_readiness,
    create_assessment,
    create_assessment_item,
    delete_assessment_item,
    get_assessment,
    get_assessment_by_activity_uuid,
    get_assessment_submissions,
    get_my_assessment_draft,
    get_my_assessment_submissions,
    reorder_assessment_items,
    save_assessment_draft,
    start_assessment,
    submit_assessment,
    transition_assessment_lifecycle,
    update_assessment,
    update_assessment_item,
)

router = APIRouter()


@router.get("/exam/config")
async def api_get_exam_authoring_config() -> dict[str, dict[str, int]]:
    return exam_authoring_config()


@router.post("", response_model=AssessmentRead)
async def api_create_assessment(
    payload: AssessmentCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentRead:
    return await create_assessment(payload, current_user, db_session)


@router.get("/activity/{activity_uuid}", response_model=AssessmentRead)
async def api_get_assessment_by_activity(
    activity_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_optional_public_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentRead:
    return await get_assessment_by_activity_uuid(
        activity_uuid, current_user, db_session
    )


@router.get("/{assessment_uuid}", response_model=AssessmentRead)
async def api_get_assessment(
    assessment_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_optional_public_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentRead:
    return await get_assessment(assessment_uuid, current_user, db_session)


@router.patch("/{assessment_uuid}", response_model=AssessmentRead)
async def api_update_assessment(
    assessment_uuid: str,
    payload: AssessmentUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentRead:
    return await update_assessment(assessment_uuid, payload, current_user, db_session)


@router.post("/{assessment_uuid}/lifecycle", response_model=AssessmentRead)
async def api_transition_lifecycle(
    assessment_uuid: str,
    payload: AssessmentLifecycleTransition,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentRead:
    return await transition_assessment_lifecycle(
        assessment_uuid, payload, current_user, db_session
    )


@router.get("/{assessment_uuid}/readiness", response_model=AssessmentReadiness)
async def api_check_readiness(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentReadiness:
    return await check_publish_readiness(assessment_uuid, current_user, db_session)


@router.post("/{assessment_uuid}/items", response_model=AssessmentReadItem)
async def api_create_item(
    assessment_uuid: str,
    payload: AssessmentItemCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentReadItem:
    return await create_assessment_item(
        assessment_uuid, payload, current_user, db_session
    )


@router.patch("/{assessment_uuid}/items/{item_uuid}", response_model=AssessmentReadItem)
async def api_update_item(
    assessment_uuid: str,
    item_uuid: str,
    payload: AssessmentItemUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentReadItem:
    return await update_assessment_item(
        assessment_uuid, item_uuid, payload, current_user, db_session
    )


@router.post(
    "/{assessment_uuid}/items:reorder", response_model=list[AssessmentReadItem]
)
async def api_reorder_items(
    assessment_uuid: str,
    payload: AssessmentItemReorder,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[AssessmentReadItem]:
    return await reorder_assessment_items(
        assessment_uuid, payload, current_user, db_session
    )


@router.delete("/{assessment_uuid}/items/{item_uuid}")
async def api_delete_item(
    assessment_uuid: str,
    item_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    return await delete_assessment_item(
        assessment_uuid, item_uuid, current_user, db_session
    )


@router.get(
    "/{assessment_uuid}/assignment/tasks", response_model=list[AssignmentTaskRead]
)
async def api_list_assignment_tasks(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[AssignmentTaskRead]:
    return await list_assignment_tasks(assessment_uuid, current_user, db_session)


@router.get(
    "/{assessment_uuid}/assignment/tasks/{task_uuid}", response_model=AssignmentTaskRead
)
async def api_get_assignment_task(
    assessment_uuid: str,
    task_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssignmentTaskRead:
    return await get_assignment_task(
        assessment_uuid, task_uuid, current_user, db_session
    )


@router.post("/{assessment_uuid}/assignment/tasks", response_model=AssignmentTaskRead)
async def api_create_assignment_task(
    assessment_uuid: str,
    payload: AssignmentTaskCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssignmentTaskRead:
    return await create_assignment_task(
        assessment_uuid, payload, current_user, db_session
    )


@router.put(
    "/{assessment_uuid}/assignment/tasks/{task_uuid}", response_model=AssignmentTaskRead
)
async def api_update_assignment_task(
    assessment_uuid: str,
    task_uuid: str,
    payload: AssignmentTaskUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssignmentTaskRead:
    return await update_assignment_task(
        assessment_uuid, task_uuid, payload, current_user, db_session
    )


@router.delete("/{assessment_uuid}/assignment/tasks/{task_uuid}")
async def api_delete_assignment_task(
    assessment_uuid: str,
    task_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    return await delete_assignment_task(
        assessment_uuid, task_uuid, current_user, db_session
    )


@router.get("/{assessment_uuid}/exam/questions", response_model=list[QuestionRead])
async def api_list_exam_questions(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[QuestionRead]:
    return await list_exam_questions(assessment_uuid, current_user, db_session)


@router.post("/{assessment_uuid}/exam/questions", response_model=QuestionRead)
async def api_create_exam_question(
    assessment_uuid: str,
    payload: QuestionCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> QuestionRead:
    return await create_exam_question(
        assessment_uuid, payload, current_user, db_session
    )


@router.put(
    "/{assessment_uuid}/exam/questions/{question_uuid}", response_model=QuestionRead
)
async def api_update_exam_question(
    assessment_uuid: str,
    question_uuid: str,
    payload: QuestionUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> QuestionRead:
    return await update_exam_question(
        assessment_uuid, question_uuid, payload, current_user, db_session
    )


@router.delete("/{assessment_uuid}/exam/questions/{question_uuid}")
async def api_delete_exam_question(
    assessment_uuid: str,
    question_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    return await delete_exam_question(
        assessment_uuid, question_uuid, current_user, db_session
    )


@router.post(
    "/{assessment_uuid}/exam/questions:reorder", response_model=list[QuestionRead]
)
async def api_reorder_exam_questions(
    assessment_uuid: str,
    payload: list[dict[str, object]],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[QuestionRead]:
    return await reorder_exam_questions(
        assessment_uuid, payload, current_user, db_session
    )


@router.get("/{assessment_uuid}/exam/questions:export-csv")
async def api_export_exam_questions_csv(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    content = await export_exam_questions_csv(assessment_uuid, current_user, db_session)
    return Response(content=content, media_type="text/csv; charset=utf-8")


@router.post("/{assessment_uuid}/exam/questions:import-csv")
async def api_import_exam_questions_csv(
    assessment_uuid: str,
    file: Annotated[UploadFile, File()],
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session: Annotated[Session, Depends(get_db_session)] = None,
) -> dict[str, object]:
    content = (await file.read()).decode("utf-8-sig")
    return await import_exam_questions_csv(
        assessment_uuid, content, current_user, db_session
    )


@router.post("/{assessment_uuid}/start", response_model=SubmissionRead)
async def api_start_assessment(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> SubmissionRead:
    return await start_assessment(assessment_uuid, current_user, db_session)


@router.get("/{assessment_uuid}/draft", response_model=AssessmentDraftRead)
async def api_get_draft(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentDraftRead:
    return await get_my_assessment_draft(assessment_uuid, current_user, db_session)


@router.patch("/{assessment_uuid}/draft", response_model=SubmissionRead)
async def api_save_draft(
    assessment_uuid: str,
    payload: AssessmentDraftPatch,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> SubmissionRead:
    return await save_assessment_draft(
        assessment_uuid,
        payload,
        current_user,
        db_session,
        if_match=if_match,
    )


@router.post("/{assessment_uuid}/submit", response_model=SubmissionRead)
async def api_submit_assessment(
    assessment_uuid: str,
    payload: AssessmentDraftPatch | None = None,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session: Annotated[Session, Depends(get_db_session)] = None,
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    violation_count: Annotated[int, Query(ge=0)] = 0,
) -> SubmissionRead:
    return await submit_assessment(
        assessment_uuid,
        payload,
        current_user,
        db_session,
        violation_count=violation_count,
        if_match=if_match,
    )


@router.get("/{assessment_uuid}/me", response_model=list[SubmissionRead])
async def api_get_my_submissions(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[SubmissionRead]:
    return await get_my_assessment_submissions(
        assessment_uuid, current_user, db_session
    )


@router.get("/{assessment_uuid}/submissions", response_model=SubmissionListResponse)
async def api_get_submissions(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    status_filter: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> SubmissionListResponse:
    return await get_assessment_submissions(
        assessment_uuid,
        current_user,
        db_session,
        status_filter=status_filter,
        page=page,
        page_size=page_size,
    )
