from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session, col, select

from src.auth.users import get_public_user
from src.db.ai_submission_analysis import AISubmissionAnalysis, AISubmissionAnalysisRead
from src.db.grading.submissions import Submission
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.ai.operations import run_submission_analysis

router = APIRouter(prefix="/submission-analysis")


class SubmissionAnalysisRequest(PydanticStrictBaseModel):
    language: str = "auto"


@router.post("/{submission_uuid}/analyze", response_model=AISubmissionAnalysisRead)
async def api_analyze_submission(
    submission_uuid: str,
    payload: SubmissionAnalysisRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AISubmissionAnalysis:
    return await run_submission_analysis(db_session, submission_uuid, current_user, payload.language)


@router.get("/{submission_uuid}/latest", response_model=AISubmissionAnalysisRead | None)
async def api_latest_submission_analysis(
    submission_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AISubmissionAnalysis | None:
    submission = db_session.exec(select(Submission).where(Submission.submission_uuid == submission_uuid)).first()
    if submission is None or submission.id is None:
        return None
    return db_session.exec(
        select(AISubmissionAnalysis)
        .where(AISubmissionAnalysis.submission_id == submission.id)
        .order_by(col(AISubmissionAnalysis.created_at).desc())
    ).first()
