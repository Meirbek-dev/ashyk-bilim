from __future__ import annotations

import asyncio
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select as sa_select
from sqlmodel import Session

from src.auth.users import get_public_user
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.security.rbac import PermissionChecker
from src.services.analytics import (
    create_teacher_intervention,
    delete_analytics_view,
    export_assessment_outcomes_csv,
    export_at_risk_csv,
    export_course_progress_csv,
    export_grading_backlog_csv,
    get_admin_analytics,
    get_at_risk_learners,
    get_drillthrough_rows,
    get_teacher_assessment_detail,
    get_teacher_assessment_list,
    get_teacher_course_detail,
    get_teacher_course_list,
    get_teacher_overview,
    list_saved_analytics_views,
    list_teacher_interventions,
    save_analytics_view,
)
from src.services.analytics.filters import AnalyticsFilters, get_analytics_filters
from src.services.analytics.schemas import (
    AdminAnalyticsResponse,
    AtRiskLearnersResponse,
    DrillThroughResponse,
    SavedAnalyticsViewCreate,
    SavedAnalyticsViewListResponse,
    SavedAnalyticsViewRow,
    TeacherAssessmentDetailResponse,
    TeacherAssessmentListResponse,
    TeacherCourseDetailResponse,
    TeacherCourseListResponse,
    TeacherInterventionCreate,
    TeacherInterventionListResponse,
    TeacherInterventionRow,
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


async def _scope_for(
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    filters: AnalyticsFilters,
    *,
    action: str,
):
    checker = PermissionChecker(db_session)
    return await asyncio.to_thread(
        resolve_teacher_scope, db_session, checker, current_user, filters, action=action
    )


async def _course_scope_for(
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    course_id: int,
    filters: AnalyticsFilters,
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    await asyncio.to_thread(ensure_course_in_scope, scope, course_id)
    return scope


async def _assessment_scope_for(
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    assessment_type: str,
    assessment_id: int,
    filters: AnalyticsFilters,
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    await asyncio.to_thread(
        ensure_assessment_in_scope, db_session, scope, assessment_type, assessment_id
    )
    return scope


@router.get("/teacher/overview", response_model=TeacherOverviewResponse)
async def teacher_overview_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    return await asyncio.to_thread(get_teacher_overview, db_session, scope, filters)


@router.get("/admin/overview", response_model=AdminAnalyticsResponse)
async def admin_analytics_overview_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    if not scope.has_platform_scope:
        raise HTTPException(status_code=403, detail="Platform analytics scope required")
    return await asyncio.to_thread(get_admin_analytics, db_session, scope, filters)


@router.get("/teacher/courses", response_model=TeacherCourseListResponse)
async def teacher_courses_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    return await asyncio.to_thread(get_teacher_course_list, db_session, scope, filters)


@router.get(
    "/teacher/courses/by-uuid/{course_uuid}",
    response_model=TeacherCourseDetailResponse,
)
async def teacher_course_detail_by_uuid_platform(
    course_uuid: str,
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    course = await asyncio.to_thread(
        lambda: db_session.exec(
            sa_select(Course).where(
                Course.course_uuid == course_uuid, Course.id.in_(scope.course_ids)
            )
        ).first()
    )
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found in scope")
    try:
        return await asyncio.to_thread(
            get_teacher_course_detail, db_session, scope, course.id, filters
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/teacher/courses/{course_id}", response_model=TeacherCourseDetailResponse)
async def teacher_course_detail_platform(
    course_id: int,
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _course_scope_for(db_session, current_user, course_id, filters)
    try:
        return await asyncio.to_thread(
            get_teacher_course_detail, db_session, scope, course_id, filters
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/teacher/assessments", response_model=TeacherAssessmentListResponse)
async def teacher_assessments_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    return await asyncio.to_thread(
        get_teacher_assessment_list, db_session, scope, filters
    )


@router.get(
    "/teacher/assessments/{assessment_type}/{assessment_id}",
    response_model=TeacherAssessmentDetailResponse,
)
async def teacher_assessment_detail_platform(
    assessment_type: str,
    assessment_id: int,
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _assessment_scope_for(
        db_session,
        current_user,
        assessment_type,
        assessment_id,
        filters,
    )
    try:
        return await asyncio.to_thread(
            get_teacher_assessment_detail,
            db_session,
            scope,
            assessment_type,
            assessment_id,
            filters,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/teacher/learners/at-risk", response_model=AtRiskLearnersResponse)
async def teacher_at_risk_learners_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    return await asyncio.to_thread(get_at_risk_learners, db_session, scope, filters)


@router.get(
    "/teacher/interventions",
    response_model=TeacherInterventionListResponse,
)
async def teacher_interventions_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    user_id: int | None = None,
    course_id: int | None = None,
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    return await asyncio.to_thread(
        list_teacher_interventions,
        db_session,
        scope,
        user_id=user_id,
        course_id=course_id,
    )


@router.post(
    "/teacher/interventions",
    response_model=TeacherInterventionRow,
)
async def create_teacher_intervention_platform(
    payload: TeacherInterventionCreate,
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    return await asyncio.to_thread(
        create_teacher_intervention,
        db_session,
        scope,
        payload,
    )


@router.get(
    "/teacher/saved-views",
    response_model=SavedAnalyticsViewListResponse,
)
async def teacher_saved_views_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    return await asyncio.to_thread(list_saved_analytics_views, db_session, scope)


@router.post(
    "/teacher/saved-views",
    response_model=SavedAnalyticsViewRow,
)
async def save_teacher_saved_view_platform(
    payload: SavedAnalyticsViewCreate,
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    return await asyncio.to_thread(save_analytics_view, db_session, scope, payload)


@router.delete("/teacher/saved-views/{view_id}", status_code=204)
async def delete_teacher_saved_view_platform(
    view_id: int,
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    deleted = await asyncio.to_thread(
        delete_analytics_view, db_session, scope, view_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Saved view not found")
    return Response(status_code=204)


@router.get(
    "/teacher/drill-through/{metric}",
    response_model=DrillThroughResponse,
)
async def teacher_drillthrough_platform(
    metric: Literal["active_learners", "completion_rate", "pass_rate", "backlog"],
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    course_id: int | None = None,
    assessment_type: str | None = None,
    assessment_id: int | None = None,
):
    scope = await _scope_for(db_session, current_user, filters, action="read")
    if course_id is not None:
        await asyncio.to_thread(ensure_course_in_scope, scope, course_id)
    if metric == "pass_rate":
        if assessment_type is None or assessment_id is None:
            raise HTTPException(
                status_code=422,
                detail="assessment_type and assessment_id are required for pass_rate",
            )
        await asyncio.to_thread(
            ensure_assessment_in_scope,
            db_session,
            scope,
            assessment_type,
            assessment_id,
        )
    return await asyncio.to_thread(
        get_drillthrough_rows,
        db_session,
        scope,
        filters,
        metric,
        course_id=course_id,
        assessment_type=assessment_type,
        assessment_id=assessment_id,
    )


@router.get("/teacher/exports/at-risk.csv")
async def teacher_at_risk_export_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="export")
    return _csv_response(
        await asyncio.to_thread(export_at_risk_csv, db_session, scope, filters),
        "teacher-at-risk.csv",
    )


@router.get("/teacher/exports/grading-backlog.csv")
async def teacher_grading_backlog_export_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="export")
    return _csv_response(
        await asyncio.to_thread(export_grading_backlog_csv, db_session, scope, filters),
        "teacher-grading-backlog.csv",
    )


@router.get("/teacher/exports/course-progress.csv")
async def teacher_course_progress_export_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="export")
    return _csv_response(
        await asyncio.to_thread(export_course_progress_csv, db_session, scope, filters),
        "teacher-course-progress.csv",
    )


@router.get("/teacher/exports/assessment-outcomes.csv")
async def teacher_assessment_outcomes_export_platform(
    filters: Annotated[AnalyticsFilters, Depends(get_analytics_filters)],
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    scope = await _scope_for(db_session, current_user, filters, action="export")
    return _csv_response(
        await asyncio.to_thread(
            export_assessment_outcomes_csv, db_session, scope, filters
        ),
        "teacher-assessment-outcomes.csv",
    )
