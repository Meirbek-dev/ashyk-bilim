from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select as sa_select
from sqlmodel import Session

from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user
from src.security.rbac import PermissionChecker
from src.services.analytics import (
    export_assessment_outcomes_csv,
    export_at_risk_csv,
    export_course_progress_csv,
    export_grading_backlog_csv,
    get_at_risk_learners,
    get_teacher_assessment_detail,
    get_teacher_assessment_list,
    get_teacher_course_detail,
    get_teacher_course_list,
    get_teacher_overview,
)
from src.services.analytics.filters import AnalyticsFilters, get_analytics_filters
from src.services.analytics.schemas import (
    AtRiskLearnersResponse,
    TeacherAssessmentDetailResponse,
    TeacherAssessmentListResponse,
    TeacherCourseDetailResponse,
    TeacherCourseListResponse,
    TeacherOverviewResponse,
)
from src.services.analytics.scope import (
    ensure_assessment_in_scope,
    ensure_course_in_scope,
    resolve_teacher_scope,
)

router = APIRouter()


def _csv_response(stream, filename: str) -> StreamingResponse:
    return StreamingResponse(
        stream,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _scope_for(
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    filters: AnalyticsFilters,
    *,
    action: str,
):
    checker = PermissionChecker(db_session)
    return resolve_teacher_scope(
        db_session, checker, current_user, filters, action=action
    )


def _course_scope_for(
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    course_id: int,
    filters: AnalyticsFilters,
):
    scope = _scope_for(db_session, current_user, filters, action="read")
    ensure_course_in_scope(scope, course_id)
    return scope


def _assessment_scope_for(
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    assessment_type: str,
    assessment_id: int,
    filters: AnalyticsFilters,
):
    scope = _scope_for(db_session, current_user, filters, action="read")
    ensure_assessment_in_scope(db_session, scope, assessment_type, assessment_id)
    return scope


@router.get("/teacher/overview", response_model=TeacherOverviewResponse)
async def teacher_overview_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = _scope_for(db_session, current_user, filters, action="read")
    return get_teacher_overview(db_session, scope, filters)


@router.get("/teacher/courses", response_model=TeacherCourseListResponse)
async def teacher_courses_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = _scope_for(db_session, current_user, filters, action="read")
    return get_teacher_course_list(db_session, scope, filters)


@router.get(
    "/teacher/courses/by-uuid/{course_uuid}",
    response_model=TeacherCourseDetailResponse,
)
async def teacher_course_detail_by_uuid_platform(
    course_uuid: str,
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = _scope_for(db_session, current_user, filters, action="read")
    course = db_session.exec(
        sa_select(Course).where(
            Course.course_uuid == course_uuid, Course.id.in_(scope.course_ids)
        )
    ).first()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found in scope")
    try:
        return get_teacher_course_detail(db_session, scope, course.id, filters)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/teacher/courses/{course_id}", response_model=TeacherCourseDetailResponse)
async def teacher_course_detail_platform(
    course_id: int,
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = _course_scope_for(db_session, current_user, course_id, filters)
    try:
        return get_teacher_course_detail(db_session, scope, course_id, filters)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/teacher/assessments", response_model=TeacherAssessmentListResponse)
async def teacher_assessments_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = _scope_for(db_session, current_user, filters, action="read")
    return get_teacher_assessment_list(db_session, scope, filters)


@router.get(
    "/teacher/assessments/{assessment_type}/{assessment_id}",
    response_model=TeacherAssessmentDetailResponse,
)
async def teacher_assessment_detail_platform(
    assessment_type: str,
    assessment_id: int,
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = _assessment_scope_for(
        db_session,
        current_user,
        assessment_type,
        assessment_id,
        filters,
    )
    try:
        return get_teacher_assessment_detail(
            db_session, scope, assessment_type, assessment_id, filters
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/teacher/learners/at-risk", response_model=AtRiskLearnersResponse)
async def teacher_at_risk_learners_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = _scope_for(db_session, current_user, filters, action="read")
    return get_at_risk_learners(db_session, scope, filters)


@router.get("/teacher/exports/at-risk.csv")
async def teacher_at_risk_export_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = _scope_for(db_session, current_user, filters, action="export")
    return _csv_response(
        export_at_risk_csv(db_session, scope, filters), "teacher-at-risk.csv"
    )


@router.get("/teacher/exports/grading-backlog.csv")
async def teacher_grading_backlog_export_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = _scope_for(db_session, current_user, filters, action="export")
    return _csv_response(
        export_grading_backlog_csv(db_session, scope, filters),
        "teacher-grading-backlog.csv",
    )


@router.get("/teacher/exports/course-progress.csv")
async def teacher_course_progress_export_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = _scope_for(db_session, current_user, filters, action="export")
    return _csv_response(
        export_course_progress_csv(db_session, scope, filters),
        "teacher-course-progress.csv",
    )


@router.get("/teacher/exports/assessment-outcomes.csv")
async def teacher_assessment_outcomes_export_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = _scope_for(db_session, current_user, filters, action="export")
    return _csv_response(
        export_assessment_outcomes_csv(db_session, scope, filters),
        "teacher-assessment-outcomes.csv",
    )
