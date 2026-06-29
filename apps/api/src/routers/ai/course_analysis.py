from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session, col, select

from src.auth.users import get_public_user
from src.db.ai_course_analysis import AICourseAnalysis, AICourseAnalysisRead
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.ai.operations import publish_course_analysis, run_course_analysis
from src.services.courses.courses import _get_course_by_uuid  # pyright: ignore[reportPrivateUsage]

router = APIRouter(prefix="/course-analysis")


class CourseAnalysisRequest(PydanticStrictBaseModel):
    language: str = "auto"


@router.post("/{course_uuid}/analyze", response_model=AICourseAnalysisRead)
async def api_analyze_course(
    course_uuid: str,
    payload: CourseAnalysisRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AICourseAnalysis:
    return await run_course_analysis(db_session, course_uuid, current_user, payload.language)


@router.get("/{course_uuid}/latest", response_model=AICourseAnalysisRead | None)
async def api_latest_course_analysis(
    course_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AICourseAnalysis | None:
    course = _get_course_by_uuid(db_session, course_uuid)
    if course is None or course.id is None:
        return None
    return db_session.exec(
        select(AICourseAnalysis)
        .where(AICourseAnalysis.course_id == course.id)
        .order_by(col(AICourseAnalysis.created_at).desc())
    ).first()


@router.post("/{analysis_uuid}/publish", response_model=AICourseAnalysisRead)
async def api_publish_course_analysis(
    analysis_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AICourseAnalysis:
    return publish_course_analysis(db_session, analysis_uuid, current_user)
