"""
Student-facing grading routes.

POST /grading/start/{activity_id}        — server-stamp the start time
POST /grading/submit/{activity_id}       — submit answers and receive grading result
GET  /grading/submissions/me             — student's own submissions for an activity
GET  /grading/submissions/me/{uuid}      — student fetches one of their own submissions
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi import status as http_status
from sqlalchemy import desc
from sqlmodel import Session, select

from src.auth.users import get_public_user
from src.db.grading.entries import GradingEntry
from src.db.grading.submissions import (
    AssessmentType,
    GradingBreakdown,
    Submission,
    SubmissionRead,
    SubmissionStatus,
)
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.grading.settings_loader import load_activity_settings
from src.services.grading.submission import (
    create_resubmission_draft,
    start_submission_v2,
)
from src.services.grading.submit import submit_assessment

router = APIRouter()


@router.post("/start/{activity_id}", response_model=SubmissionRead)
async def api_start_submission_legacy(
    request: Request,
    activity_id: int,
    assessment_type: AssessmentType,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> SubmissionRead:
    """
    (Legacy) Create a DRAFT Submission and record the server-stamped start time.

    Prefer POST /grading/start/v2/{activity_id} for new integrations — that
    endpoint enforces max_attempts from AssessmentPolicy rather than block
    content so attempt counting is consistent across all submit paths.
    """
    return start_submission_v2(
        activity_id=activity_id,
        assessment_type=assessment_type,
        current_user=current_user,
        db_session=db_session,
    )


@router.post("/start/v2/{activity_id}", response_model=SubmissionRead)
async def api_start_submission(
    request: Request,
    activity_id: int,
    assessment_type: AssessmentType,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> SubmissionRead:
    """
    Create a DRAFT Submission and record the server-stamped start time.

    Enforces max_attempts from AssessmentPolicy (canonical DB source).
    Must be called before submitting a quiz or exam so the server controls
    the start timestamp (prevents client falsification).
    """
    return start_submission_v2(
        activity_id=activity_id,
        assessment_type=assessment_type,
        current_user=current_user,
        db_session=db_session,
    )


@router.post("/submit/{activity_id}", response_model=SubmissionRead)
async def api_submit_assessment(
    request: Request,
    activity_id: int,
    assessment_type: AssessmentType,
    answers_payload: dict,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    violation_count: Annotated[int, Query(ge=0)] = 0,
) -> SubmissionRead:
    """
    Submit an assessment attempt and receive auto-grading results.

    Settings (questions, time limits, due date) are loaded server-side
    from the Block content — not supplied by the client.
    """
    settings = load_activity_settings(activity_id, assessment_type, db_session)

    return await submit_assessment(
        request=request,
        activity_id=activity_id,
        assessment_type=assessment_type,
        answers_payload=answers_payload,
        settings=settings,
        current_user=current_user,
        db_session=db_session,
        violation_count=violation_count,
    )


@router.post("/submissions/{submission_uuid}/submit", response_model=SubmissionRead)
async def api_submit_by_uuid(
    request: Request,
    submission_uuid: str,
    answers_payload: dict,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    violation_count: Annotated[int, Query(ge=0)] = 0,
) -> SubmissionRead:
    """
    Submit a specific DRAFT submission identified by UUID.

    Functionally equivalent to POST /grading/submit/{activity_id} but uses the
    submission UUID as the primary key, making it safe for multi-attempt flows
    where a student may have more than one submission row for an activity.
    """
    submission = db_session.exec(
        select(Submission).where(
            Submission.submission_uuid == submission_uuid,
            Submission.user_id == current_user.id,
        )
    ).first()

    if not submission:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )

    if submission.status != SubmissionStatus.DRAFT:
        if submission.status in {
            SubmissionStatus.PENDING,
            SubmissionStatus.GRADED,
            SubmissionStatus.PUBLISHED,
        }:
            return _apply_grade_visibility(submission, db_session)
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Submission is not submittable (current status: {submission.status})",
        )

    settings = load_activity_settings(
        submission.activity_id, submission.assessment_type, db_session
    )
    return await submit_assessment(
        request=request,
        activity_id=submission.activity_id,
        assessment_type=submission.assessment_type,
        answers_payload=answers_payload,
        settings=settings,
        current_user=current_user,
        db_session=db_session,
        violation_count=violation_count,
        submission_uuid=submission_uuid,
    )


@router.post("/submissions/{submission_uuid}/resubmit", response_model=SubmissionRead)
async def api_resubmit(
    submission_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> SubmissionRead:
    """
    Create a new DRAFT from a RETURNED submission (resubmission flow).

    The original RETURNED submission is preserved as the submission history.
    The new DRAFT gets attempt_number = previous + 1 and a fresh started_at.

    Returns 422 if the submission is not in RETURNED state.
    Returns 403 if the student has exhausted max_attempts.
    """
    return create_resubmission_draft(
        submission_uuid=submission_uuid,
        current_user=current_user,
        db_session=db_session,
    )


@router.get("/submissions/me", response_model=list[SubmissionRead])
async def api_get_my_submissions(
    activity_id: int,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> list[SubmissionRead]:
    """Get the current user's submissions for an activity (most-recent first).

    Grade details are hidden when the activity uses BATCH release mode and the
    teacher has not yet published grades for this submission.
    """
    submissions = db_session.exec(
        select(Submission)
        .where(
            Submission.activity_id == activity_id,
            Submission.user_id == current_user.id,
        )
        .order_by(desc(Submission.created_at))
    ).all()
    return [_apply_grade_visibility(s, db_session) for s in submissions]


@router.get("/submissions/me/{submission_uuid}", response_model=SubmissionRead)
async def api_get_my_submission(
    submission_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> SubmissionRead:
    """
    Student fetches one of their own submissions to see grade/feedback.

    Ownership is enforced: only the submitting student can access this endpoint.
    Grade details are hidden when the activity uses BATCH release mode and the
    teacher has not yet published grades for this submission.
    """
    submission = db_session.exec(
        select(Submission).where(
            Submission.submission_uuid == submission_uuid,
            Submission.user_id == current_user.id,
        )
    ).first()

    if not submission:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )

    return _apply_grade_visibility(submission, db_session)


# ── Grade visibility helper ───────────────────────────────────────────────────


def _apply_grade_visibility(submission: Submission, db_session: Session) -> SubmissionRead:
    """Return a SubmissionRead, masking grade fields until a grade is published.

    Grades are only shown if a GradingEntry exists with published_at IS NOT NULL.
    Legacy PUBLISHED submissions without ledger rows remain visible for backward
    compatibility; draft GRADED rows are masked.
    """
    result = SubmissionRead.model_validate(submission)

    # Current mode: check for a published GradingEntry
    published_entry = db_session.exec(
        select(GradingEntry).where(
            GradingEntry.submission_id == submission.id,
            GradingEntry.published_at.is_not(None),  # type: ignore[attr-defined]
        )
    ).first()

    if published_entry is not None:
        result.final_score = published_entry.final_score
        result.late_penalty_pct = published_entry.penalty_pct
        if isinstance(published_entry.breakdown, dict):
            result.grading_json = GradingBreakdown(**published_entry.breakdown)
        return result  # grade is published — show it

    if submission.status == SubmissionStatus.PUBLISHED:
        return result

    # No published entry — mask scores and grading breakdown
    result.final_score = None
    result.auto_score = None
    result.grading_json = GradingBreakdown()
    return result
