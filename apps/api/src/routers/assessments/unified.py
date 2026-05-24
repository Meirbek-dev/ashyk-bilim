"""Unified assessment routes.

These are the canonical verbs for authoring, lifecycle, attempts, drafts, and
teacher submission lists.
"""

import asyncio

_SUBMIT_SEMAPHORE = asyncio.Semaphore(15)

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from src.auth.users import get_optional_public_user, get_public_user
from src.core.http import get_content_disposition_header
from src.db.assessments import (
    AssessmentAccessRead,
    AssessmentAccessUpdate,
    AssessmentAccessUserGroupRead,
    AssessmentAccessUserRead,
    AssessmentAttemptProjection,
    AssessmentCreate,
    AssessmentDraftPatch,
    AssessmentDraftRead,
    AssessmentItemCreate,
    AssessmentItemReorder,
    AssessmentItemUpdate,
    AssessmentLifecycleTransition,
    AssessmentPolicyPreset,
    AssessmentRead,
    AssessmentReadiness,
    AssessmentReadItem,
    AssessmentUpdate,
    CodeRunRequest,
    CodeRunResponse,
    GradingDraftSave,
    ReviewQueueRead,
    StudentPolicyOverrideCreate,
    StudentPolicyOverrideRead,
    StudentPolicyOverrideUpdate,
    StudentSubmissionRead,
    TeacherSubmissionRead,
)
from src.db.grading.schemas import BulkPublishGradesResponse
from src.db.grading.submissions import (
    AssessmentType,
    ItemAnalytics,
    SubmissionStats,
    TeacherGradeInput,
)
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.services.assessments.core import (
    check_publish_readiness,
    create_assessment,
    create_assessment_item,
    create_student_policy_override,
    delete_assessment_item,
    delete_student_policy_override,
    duplicate_assessment,
    get_assessment,
    get_assessment_access,
    get_assessment_by_activity_uuid,
    get_assessment_submission,
    get_assessment_submission_stats,
    get_assessment_submissions,
    get_attempt_state,
    get_code_item_run,
    get_item_analytics,
    get_my_assessment_draft,
    get_my_assessment_submissions,
    get_policy_preset,
    list_assessment_access_eligible_usergroups,
    list_assessment_access_eligible_users,
    list_student_policy_overrides,
    publish_assessment_grades,
    reorder_assessment_items,
    run_code_item,
    save_assessment_draft,
    save_assessment_grade,
    save_grading_draft,
    start_assessment,
    submit_assessment,
    transition_assessment_lifecycle,
    update_assessment,
    update_assessment_access,
    update_assessment_item,
    update_student_policy_override,
)
from src.services.assessments.inline_quiz import (
    InlineQuizCreate,
    InlineQuizResponse,
    create_inline_quiz,
)
from src.services.grading.teacher import export_grades_csv
from src.services.rate_limit import auth_or_ip_key, rate_limit_dependency

router = APIRouter()


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


@router.get("/{assessment_uuid}/access", response_model=AssessmentAccessRead)
async def api_get_access(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentAccessRead:
    return await get_assessment_access(assessment_uuid, current_user, db_session)


@router.put("/{assessment_uuid}/access", response_model=AssessmentAccessRead)
async def api_update_access(
    assessment_uuid: str,
    payload: AssessmentAccessUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentAccessRead:
    return await update_assessment_access(
        assessment_uuid, payload, current_user, db_session
    )


@router.get(
    "/{assessment_uuid}/access/eligible-learners",
    response_model=list[AssessmentAccessUserRead],
)
async def api_list_access_eligible_learners(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await list_assessment_access_eligible_users(
        assessment_uuid, current_user, db_session
    )


@router.get(
    "/{assessment_uuid}/access/eligible-usergroups",
    response_model=list[AssessmentAccessUserGroupRead],
)
async def api_list_access_eligible_usergroups(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    return await list_assessment_access_eligible_usergroups(
        assessment_uuid, current_user, db_session
    )


# ── Items CRUD ─────────────────────────────────────────────────────────────────


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


# ── Student attempt flow ───────────────────────────────────────────────────────


@router.post("/{assessment_uuid}/start", response_model=StudentSubmissionRead)
async def api_start_assessment(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StudentSubmissionRead:
    return await start_assessment(assessment_uuid, current_user, db_session)


@router.get("/{assessment_uuid}/draft", response_model=AssessmentDraftRead)
async def api_get_draft(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentDraftRead:
    return await get_my_assessment_draft(assessment_uuid, current_user, db_session)


@router.patch("/{assessment_uuid}/draft", response_model=StudentSubmissionRead)
async def api_save_draft(
    assessment_uuid: str,
    payload: AssessmentDraftPatch,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> StudentSubmissionRead:
    return await save_assessment_draft(
        assessment_uuid,
        payload,
        current_user,
        db_session,
        if_match=if_match,
    )


@router.post(
    "/{assessment_uuid}/submit",
    response_model=StudentSubmissionRead,
    dependencies=[
        Depends(
            rate_limit_dependency(
                namespace="assessment:submit",
                max_requests=3,
                window_seconds=10,
                key_func=auth_or_ip_key,
            )
        )
    ],
)
async def api_submit_assessment(
    assessment_uuid: str,
    payload: AssessmentDraftPatch | None = None,
    current_user: Annotated[PublicUser, Depends(get_public_user)] = None,
    db_session: Annotated[Session, Depends(get_db_session)] = None,
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    violation_count: Annotated[int, Query(ge=0)] = 0,
    auto_submit: Annotated[bool, Query()] = False,
) -> StudentSubmissionRead:
    try:
        await asyncio.wait_for(_SUBMIT_SEMAPHORE.acquire(), timeout=0.1)
    except TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "SERVER_OVERLOADED",
                "message": "Система временно перегружена. Пожалуйста, попробуйте позже."
            },
            headers={"Retry-After": "10"}
        )

    try:
        return await submit_assessment(
            assessment_uuid,
            payload,
            current_user,
            db_session,
            violation_count=violation_count,
            if_match=if_match,
            auto_submit=auto_submit,
        )
    finally:
        _SUBMIT_SEMAPHORE.release()


@router.get("/{assessment_uuid}/me", response_model=list[StudentSubmissionRead])
async def api_get_my_submissions(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[StudentSubmissionRead]:
    return await get_my_assessment_submissions(
        assessment_uuid, current_user, db_session
    )


@router.get("/{assessment_uuid}/submissions", response_model=ReviewQueueRead)
async def api_get_submissions(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    late_only: Annotated[bool, Query()] = False,
    search: Annotated[str | None, Query()] = None,
    sort_by: Annotated[str, Query()] = "submitted_at",
    sort_dir: Annotated[str, Query()] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ReviewQueueRead:
    return await get_assessment_submissions(
        assessment_uuid,
        current_user,
        db_session,
        status_filter=status_filter,
        late_only=late_only,
        search=search,
        sort_by=sort_by,
        sort_dir=sort_dir,
        page=page,
        page_size=page_size,
    )


@router.get("/{assessment_uuid}/submissions/stats", response_model=SubmissionStats)
async def api_get_submission_stats(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> SubmissionStats:
    return await get_assessment_submission_stats(
        assessment_uuid,
        current_user,
        db_session,
    )


@router.get("/{assessment_uuid}/item-analytics", response_model=list[ItemAnalytics])
async def api_get_item_analytics(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[ItemAnalytics]:
    """Return per-question analytics for the teacher Results dashboard."""
    return await get_item_analytics(assessment_uuid, current_user, db_session)


@router.get("/{assessment_uuid}/submissions/export")
async def api_export_assessment_submissions_csv(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    assessment_type: Annotated[
        str | None,
        Query(
            description="Filter by assessment type (QUIZ, OPEN_TEXT, CODE_CHALLENGE, etc.)"
        ),
    ] = None,
    submitted_after: Annotated[
        datetime | None,
        Query(
            description="Only include submissions submitted after this ISO-8601 datetime"
        ),
    ] = None,
    submitted_before: Annotated[
        datetime | None,
        Query(
            description="Only include submissions submitted before this ISO-8601 datetime"
        ),
    ] = None,
) -> StreamingResponse:
    assessment = await get_assessment(assessment_uuid, current_user, db_session)
    return StreamingResponse(
        export_grades_csv(
            activity_id=assessment.activity_id,
            current_user=current_user,
            db_session=db_session,
            assessment_type_filter=assessment_type,
            submitted_after=submitted_after,
            submitted_before=submitted_before,
        ),
        media_type="text/csv",
        headers={
            "Content-Disposition": get_content_disposition_header(
                f"grades-assessment-{assessment_uuid}.csv"
            )
        },
    )


@router.get(
    "/{assessment_uuid}/submissions/{submission_uuid}",
    response_model=TeacherSubmissionRead,
)
async def api_get_submission(
    assessment_uuid: str,
    submission_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> TeacherSubmissionRead:
    return await get_assessment_submission(
        assessment_uuid,
        submission_uuid,
        current_user,
        db_session,
    )


@router.patch(
    "/{assessment_uuid}/submissions/{submission_uuid}",
    response_model=TeacherSubmissionRead,
)
async def api_save_grade(
    assessment_uuid: str,
    submission_uuid: str,
    payload: TeacherGradeInput,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> TeacherSubmissionRead:
    return await save_assessment_grade(
        assessment_uuid,
        submission_uuid,
        payload,
        current_user,
        db_session,
        if_match=if_match,
    )


@router.post(
    "/{assessment_uuid}/publish-grades", response_model=BulkPublishGradesResponse
)
async def api_publish_grades(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> BulkPublishGradesResponse:
    return await publish_assessment_grades(
        assessment_uuid,
        current_user,
        db_session,
    )


# ── Item-level grading draft ───────────────────────────────────────────────────


@router.patch(
    "/{assessment_uuid}/submissions/{submission_uuid}/grade",
    response_model=TeacherSubmissionRead,
)
async def api_save_grading_draft(
    assessment_uuid: str,
    submission_uuid: str,
    payload: GradingDraftSave,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> TeacherSubmissionRead:
    """Save an item-level grading draft. Final score is computed from item scores."""
    return await save_grading_draft(
        assessment_uuid,
        submission_uuid,
        payload,
        current_user,
        db_session,
        if_match=if_match,
    )


# ── Code challenge runtime ─────────────────────────────────────────────────────


@router.post(
    "/{assessment_uuid}/items/{item_uuid}/runs",
    response_model=CodeRunResponse,
)
async def api_run_code_item(
    assessment_uuid: str,
    item_uuid: str,
    payload: CodeRunRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> CodeRunResponse:
    """Run student code against visible test cases (does not affect grade)."""
    return await run_code_item(
        assessment_uuid, item_uuid, payload, current_user, db_session
    )


@router.get(
    "/{assessment_uuid}/items/{item_uuid}/runs/{run_uuid}",
    response_model=CodeRunResponse,
)
async def api_get_code_item_run(
    assessment_uuid: str,
    item_uuid: str,
    run_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> CodeRunResponse:
    """Fetch a previously-created student-safe code run."""
    return await get_code_item_run(
        assessment_uuid, item_uuid, run_uuid, current_user, db_session
    )


@router.post(
    "/{assessment_uuid}/code-challenge/validate",
)
async def api_validate_code_challenge(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Validate reference solutions for all configured languages against the test suite."""
    from src.services.assessments.attempt_service import validate_code_challenge_service
    return await validate_code_challenge_service(
        assessment_uuid, current_user, db_session
    )


# ── Attempt state ──────────────────────────────────────────────────────────────


@router.get(
    "/{assessment_uuid}/attempt-state",
    response_model=AssessmentAttemptProjection,
)
async def api_get_attempt_state(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AssessmentAttemptProjection:
    """Return the authoritative attempt state for the current student."""
    return await get_attempt_state(assessment_uuid, current_user, db_session)


# ── Policy preset ──────────────────────────────────────────────────────────────


@router.get(
    "/policy-preset/{kind}",
    response_model=AssessmentPolicyPreset,
)
async def api_get_policy_preset(
    kind: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> AssessmentPolicyPreset:
    """Return default policy settings for a given assessment kind."""
    try:
        assessment_kind = AssessmentType(kind)
    except ValueError:
        raise HTTPException(
            status_code=400, detail=f"Unknown assessment kind: {kind!r}"
        )
    return get_policy_preset(assessment_kind)


# ── Student policy overrides ───────────────────────────────────────────────────


@router.get(
    "/{assessment_uuid}/overrides",
    response_model=list[StudentPolicyOverrideRead],
)
async def api_list_overrides(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[StudentPolicyOverrideRead]:
    """List per-student policy overrides for this assessment."""
    return await list_student_policy_overrides(
        assessment_uuid, current_user, db_session
    )


@router.post(
    "/{assessment_uuid}/overrides",
    response_model=StudentPolicyOverrideRead,
    status_code=201,
)
async def api_create_override(
    assessment_uuid: str,
    payload: StudentPolicyOverrideCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StudentPolicyOverrideRead:
    """Create a per-student policy exception (due date extension, attempt limit, etc.)."""
    return await create_student_policy_override(
        assessment_uuid, payload, current_user, db_session
    )


@router.patch(
    "/{assessment_uuid}/overrides/{user_id}",
    response_model=StudentPolicyOverrideRead,
)
async def api_update_override(
    assessment_uuid: str,
    user_id: int,
    payload: StudentPolicyOverrideUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StudentPolicyOverrideRead:
    return await update_student_policy_override(
        assessment_uuid, user_id, payload, current_user, db_session
    )


@router.delete("/{assessment_uuid}/overrides/{user_id}")
async def api_delete_override(
    assessment_uuid: str,
    user_id: int,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    return await delete_student_policy_override(
        assessment_uuid, user_id, current_user, db_session
    )


# ── Inline quiz ────────────────────────────────────────────────────────────────


@router.post("/inline-quiz", response_model=InlineQuizResponse)
async def api_create_inline_quiz(
    payload: InlineQuizCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> InlineQuizResponse:
    """Create a new inline quiz assessment linked to a parent activity."""
    return await create_inline_quiz(payload, current_user, db_session)


# ── Audit trail ────────────────────────────────────────────────────────────────


@router.get("/{assessment_uuid}/audit")
async def api_get_audit_trail(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
):
    """List audit events for an assessment (teacher-only)."""
    from sqlalchemy import desc, func
    from sqlmodel import select

    from src.db.audit import AuditEvent, AuditEventRead
    from src.services.assessments.core import (
        _get_activity_and_course,
        _get_assessment_by_uuid_or_404,
        _require_grade,
    )

    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)

    query = (
        select(AuditEvent)
        .where(AuditEvent.target_uuid == assessment_uuid)
        .order_by(desc(AuditEvent.created_at))
    )
    total = db_session.exec(select(func.count()).select_from(query.subquery())).one()
    offset = (page - 1) * page_size
    rows = db_session.exec(query.offset(offset).limit(page_size)).all()

    return {
        "items": [AuditEventRead.model_validate(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/{assessment_uuid}/duplicate", response_model=AssessmentRead)
async def api_duplicate_assessment(
    assessment_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Duplicate an assessment.

    Creates a full deep-copy of the assessment, its items, and its policy.
    The duplicate is placed in the same chapter/course, gets new UUIDs, and
    starts in ``DRAFT`` lifecycle.  The caller must be an author of the course.
    """
    return await duplicate_assessment(
        assessment_uuid=assessment_uuid,
        current_user=current_user,
        db_session=db_session,
    )
