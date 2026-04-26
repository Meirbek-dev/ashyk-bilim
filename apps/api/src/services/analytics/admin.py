from __future__ import annotations

from collections import defaultdict

from sqlmodel import Session

from src.services.analytics.courses import build_course_rows
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    build_activity_events,
    cohort_names_for_user,
    display_name,
    load_analytics_context,
    progress_snapshots,
    safe_pct,
    to_iso,
)
from src.services.analytics.risk import build_risk_rows
from src.services.analytics.schemas import (
    AdminAnalyticsCohortRow,
    AdminAnalyticsCourseRow,
    AdminAnalyticsProgramRow,
    AdminAnalyticsResponse,
    AdminAnalyticsTeacherRow,
)
from src.services.analytics.scope import TeacherAnalyticsScope
from src.services.analytics.workload import build_teacher_workload


def get_admin_analytics(
    db_session: Session, scope: TeacherAnalyticsScope, filters: AnalyticsFilters
) -> AdminAnalyticsResponse:
    context = load_analytics_context(
        db_session,
        scope.course_ids,
        activity_start=filters.previous_window_bounds()[0],
    )
    _, course_rows = build_course_rows(scope, filters, db_session, context=context)
    snapshots = progress_snapshots(context)
    events = build_activity_events(context)
    risk_rows = build_risk_rows(context, filters)

    teacher_course_ids: dict[int, set[int]] = defaultdict(set)
    for course in context.courses_by_id.values():
        if course.creator_id is not None and course.id is not None:
            teacher_course_ids[course.creator_id].add(course.id)

    workload_rows: list[AdminAnalyticsTeacherRow] = []
    for teacher_id, course_ids in teacher_course_ids.items():
        teacher_scope = TeacherAnalyticsScope(
            teacher_user_id=teacher_id,
            course_ids=sorted(course_ids),
            cohort_ids=filters.cohort_ids,
            has_platform_scope=True,
        )
        teacher_context = load_analytics_context(
            db_session,
            teacher_scope.course_ids,
            activity_start=filters.previous_window_bounds()[0],
        )
        workload = build_teacher_workload(teacher_context, filters)
        teacher = context.users_by_id.get(teacher_id)
        workload_rows.append(
            AdminAnalyticsTeacherRow(
                teacher_user_id=teacher_id,
                teacher_display_name=display_name(teacher),
                managed_course_count=len(course_ids),
                workload_backlog=workload.backlog_total,
                sla_breaches=workload.sla_breaches,
                median_feedback_latency_hours=workload.median_feedback_latency_hours,
                at_risk_learners=sum(
                    1
                    for row in risk_rows
                    if row.course_id in course_ids and row.risk_level in {"medium", "high"}
                ),
            )
        )
    workload_rows.sort(
        key=lambda row: (row.sla_breaches, row.workload_backlog, row.at_risk_learners),
        reverse=True,
    )

    course_health: list[AdminAnalyticsCourseRow] = []
    for row in course_rows:
        course = context.courses_by_id.get(row.course_id)
        activity_count = sum(
            1
            for activity in context.activities_by_id.values()
            if activity.course_id == row.course_id
        )
        effort = max(1, activity_count)
        roi_score = round((row.completion_rate + row.content_health_score) / effort, 2)
        course_health.append(
            AdminAnalyticsCourseRow(
                course_id=row.course_id,
                course_uuid=row.course_uuid,
                course_name=row.course_name,
                health_score=row.content_health_score,
                completion_rate=row.completion_rate,
                active_learners_7d=row.active_learners_7d,
                at_risk_learners=row.at_risk_learners,
                content_roi_score=roi_score if course is not None else None,
            )
        )
    course_health.sort(key=lambda row: row.health_score)
    content_roi = sorted(
        course_health,
        key=lambda row: row.content_roi_score if row.content_roi_score is not None else -1,
        reverse=True,
    )

    current_start, _current_end = filters.window_bounds(now=context.generated_at)
    active_pairs = {(event.course_id, event.user_id) for event in events if event.ts >= current_start}
    cohort_members: dict[int, set[int]] = defaultdict(set)
    for user_id, cohort_ids in context.cohort_ids_by_user.items():
        for cohort_id in cohort_ids:
            cohort_members[cohort_id].add(user_id)
    cohort_rows: list[AdminAnalyticsCohortRow] = []
    for cohort_id, user_ids in cohort_members.items():
        retained = {
            user_id
            for user_id in user_ids
            if any(pair[1] == user_id for pair in active_pairs)
        }
        cohort_progress = [
            snapshot.progress_pct
            for snapshot in snapshots.values()
            if snapshot.user_id in user_ids
        ]
        cohort_rows.append(
            AdminAnalyticsCohortRow(
                cohort_id=cohort_id,
                cohort_name=context.usergroup_names_by_id.get(cohort_id, f"Cohort {cohort_id}"),
                learners=len(user_ids),
                retained_learners=len(retained),
                retention_rate=safe_pct(len(retained), len(user_ids)),
                avg_progress_pct=round(sum(cohort_progress) / len(cohort_progress), 1)
                if cohort_progress
                else None,
            )
        )
    cohort_rows.sort(key=lambda row: row.retention_rate or 0)

    program_rows: list[AdminAnalyticsProgramRow] = []
    by_creator: dict[int | None, list[AdminAnalyticsCourseRow]] = defaultdict(list)
    for row in course_health:
        course = context.courses_by_id.get(row.course_id)
        by_creator[course.creator_id if course is not None else None].append(row)
    for creator_id, rows in by_creator.items():
        teacher = context.users_by_id.get(creator_id) if creator_id is not None else None
        course_ids = {row.course_id for row in rows}
        learner_count = len({
            snapshot.user_id
            for snapshot in snapshots.values()
            if snapshot.course_id in course_ids
        })
        program_rows.append(
            AdminAnalyticsProgramRow(
                program_id=creator_id,
                program_name=f"{display_name(teacher)} courses" if teacher is not None else "Unassigned courses",
                course_count=len(rows),
                learner_count=learner_count,
                completion_rate=round(
                    sum(row.completion_rate for row in rows) / len(rows), 1
                )
                if rows
                else None,
                health_score=round(sum(row.health_score for row in rows) / len(rows), 1)
                if rows
                else None,
            )
        )
    program_rows.sort(key=lambda row: row.health_score or 0, reverse=True)

    return AdminAnalyticsResponse(
        generated_at=to_iso(context.generated_at) or "",
        teacher_workload_comparison=workload_rows[:25],
        course_health_ranking=course_health[:25],
        cohort_retention=cohort_rows[:25],
        department_program_performance=program_rows[:25],
        content_roi=content_roi[:25],
    )
