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

from src.db.grading.submissions import AssessmentType, Submission, SubmissionRead
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user
from src.services.grading.settings_loader import load_activity_settings
from src.services.grading.submit import start_submission, submit_assessment

router = APIRouter()


@router.post("/start/{activity_id}", response_model=SubmissionRead)
async def api_start_submission(
    request: Request,
    activity_id: int,
    assessment_type: AssessmentType,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> SubmissionRead:
    """
    Create a DRAFT Submission and record the server-stamped start time.

    Must be called before submitting a quiz or exam so the server controls
    the start timestamp (prevents client falsification).
    """
    return await start_submission(
        request=request,
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
    current_user: Annotated[PublicUser, Depends(get_current_user)],
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


@router.get("/submissions/me", response_model=list[SubmissionRead])
async def api_get_my_submissions(
    activity_id: int,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> list[SubmissionRead]:
    """Get the current user's submissions for an activity (most-recent first)."""
    submissions = db_session.exec(
        select(Submission)
        .where(
            Submission.activity_id == activity_id,
            Submission.user_id == current_user.id,
        )
        .order_by(desc(Submission.created_at))
    ).all()
    return [SubmissionRead.model_validate(s) for s in submissions]


@router.get("/submissions/me/{submission_uuid}", response_model=SubmissionRead)
async def api_get_my_submission(
    submission_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> SubmissionRead:
    """
    Student fetches one of their own submissions to see grade/feedback.

    Ownership is enforced: only the submitting student can access this endpoint.
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

    return SubmissionRead.model_validate(submission)
