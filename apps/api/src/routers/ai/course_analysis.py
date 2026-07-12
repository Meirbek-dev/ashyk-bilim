import hashlib
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlmodel import Session, col, select

from src.auth.users import get_public_user
from src.db.ai_course_analysis import AICourseAnalysis, AICourseAnalysisRead
from src.db.ai_runtime import AIRun, utc_now
from src.db.courses.courses import Course
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.routers.ai.runs import AIRunStatusRead
from src.services.ai.context.course_context import assemble_course_context_bundle
from src.services.ai.context.sources import render_context_bundle
from src.services.ai.operations import publish_course_analysis, queue_course_analysis, run_course_analysis
from src.services.ai.policy import can_update_course, require_ai_course_read, require_ai_course_update
from src.services.courses.courses import _get_course_by_uuid  # pyright: ignore[reportPrivateUsage]

router = APIRouter(prefix="/course-analysis")


class CourseAnalysisRequest(PydanticStrictBaseModel):
    language: str = "auto"


class FindingReviewRequest(PydanticStrictBaseModel):
    finding_id: str = Field(min_length=1, max_length=200)
    action: Literal["accepted", "dismissed", "task_created"]
    note: str | None = Field(default=None, max_length=1000)


@router.post("/{course_uuid}/analyze", response_model=AICourseAnalysisRead)
async def api_analyze_course(
    course_uuid: str,
    payload: CourseAnalysisRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AICourseAnalysis:
    return await run_course_analysis(db_session, course_uuid, current_user, payload.language)


@router.post("/{course_uuid}/analyze/queue", response_model=AIRunStatusRead)
async def api_queue_course_analysis(
    course_uuid: str,
    payload: CourseAnalysisRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AIRun:
    return await queue_course_analysis(db_session, course_uuid, current_user, payload.language)


@router.get("/{course_uuid}/latest", response_model=AICourseAnalysisRead | None)
async def api_latest_course_analysis(
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AICourseAnalysisRead | None:
    course = _get_course_by_uuid(db_session, course_uuid)
    if course is None or course.id is None:
        return None
    require_ai_course_read(db_session, course, current_user)
    statuses = ["published"] if not can_update_course(db_session, course, current_user) else None
    statement = select(AICourseAnalysis).where(AICourseAnalysis.course_id == course.id)
    if statuses is not None:
        statement = statement.where(col(AICourseAnalysis.status).in_(statuses))
    analyses = db_session.exec(statement.order_by(col(AICourseAnalysis.created_at).desc()).limit(2)).all()
    if not analyses:
        return None
    latest = analyses[0]
    current_context = render_context_bundle(
        assemble_course_context_bundle(db_session, course, include_unpublished=statuses is None)
    )
    current_hash = hashlib.sha256(current_context.encode()).hexdigest()
    return AICourseAnalysisRead.model_validate(latest).model_copy(
        update={
            "stale": latest.content_hash is not None and latest.content_hash != current_hash,
            "previous_public_score": analyses[1].public_score if len(analyses) > 1 else None,
        }
    )


@router.post("/{analysis_uuid}/publish", response_model=AICourseAnalysisRead)
async def api_publish_course_analysis(
    analysis_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AICourseAnalysis:
    return publish_course_analysis(db_session, analysis_uuid, current_user)


@router.post("/{analysis_uuid}/findings/review", response_model=AICourseAnalysisRead)
async def api_review_course_finding(
    analysis_uuid: str,
    payload: FindingReviewRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AICourseAnalysis:
    analysis = db_session.exec(select(AICourseAnalysis).where(AICourseAnalysis.analysis_uuid == analysis_uuid)).first()
    if analysis is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI_ANALYSIS_NOT_FOUND")
    course = db_session.get(Course, analysis.course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="COURSE_NOT_FOUND")
    require_ai_course_update(db_session, course, current_user)

    report = dict(analysis.report_json or {})
    reviews = dict(report.get("finding_reviews") or {})
    reviews[payload.finding_id] = {
        "action": payload.action,
        "note": payload.note,
        "reviewed_at": utc_now().isoformat(),
        "reviewed_by_user_id": current_user.id,
    }
    analysis.report_json = {**report, "finding_reviews": reviews}
    db_session.add(analysis)
    db_session.commit()
    db_session.refresh(analysis)
    return analysis
