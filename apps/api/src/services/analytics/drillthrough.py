from __future__ import annotations

from typing import Literal

from sqlmodel import Session

from src.services.analytics.assessments import get_teacher_assessment_detail
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    build_activity_events,
    cohort_names_for_user,
    cohort_user_ids,
    display_name,
    load_analytics_context,
    progress_snapshots,
    to_iso,
)
from src.services.analytics.schemas import DrillThroughResponse
from src.services.analytics.scope import TeacherAnalyticsScope, ensure_course_in_scope
from src.services.analytics.workload import backlog_items_for_drillthrough

DrillMetric = Literal["active_learners", "completion_rate", "pass_rate", "backlog"]


def get_drillthrough_rows(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    filters: AnalyticsFilters,
    metric: DrillMetric,
    *,
    course_id: int | None = None,
    assessment_type: str | None = None,
    assessment_id: int | None = None,
) -> DrillThroughResponse:
    if course_id is not None:
        ensure_course_in_scope(scope, course_id)
    context = load_analytics_context(
        db_session,
        [course_id] if course_id is not None else scope.course_ids,
        activity_start=filters.previous_window_bounds()[0],
    )
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    current_start, current_end = filters.window_bounds(now=context.generated_at)
    rows: list[dict[str, object]] = []

    if metric == "backlog":
        rows = backlog_items_for_drillthrough(context, filters)
    elif metric == "pass_rate":
        if assessment_type is None or assessment_id is None:
            rows = []
        else:
            detail = get_teacher_assessment_detail(
                db_session,
                scope,
                assessment_type,
                assessment_id,
                filters,
            )
            rows = [
                {
                    "user_id": learner.user_id,
                    "user_display_name": learner.user_display_name,
                    "attempts": learner.attempts,
                    "best_score": learner.best_score,
                    "last_score": learner.last_score,
                    "submitted_at": learner.submitted_at,
                    "graded_at": learner.graded_at,
                    "status": learner.status,
                    "passed": learner.best_score is not None
                    and detail.pass_threshold is not None
                    and learner.best_score >= detail.pass_threshold,
                }
                for learner in detail.learner_rows
            ]
    else:
        snapshots = progress_snapshots(context, allowed_user_ids)
        active_pairs: set[tuple[int, int]] = set()
        if metric == "active_learners":
            active_pairs = {
                (event.course_id, event.user_id)
                for event in build_activity_events(context, allowed_user_ids)
                if current_start <= event.ts <= current_end
            }
        for snapshot in snapshots.values():
            if course_id is not None and snapshot.course_id != course_id:
                continue
            user = context.users_by_id.get(snapshot.user_id)
            row = {
                "user_id": snapshot.user_id,
                "user_display_name": display_name(user),
                "course_id": snapshot.course_id,
                "course_name": context.courses_by_id[snapshot.course_id].name,
                "progress_pct": snapshot.progress_pct,
                "completed_steps": snapshot.completed_steps,
                "total_steps": snapshot.total_steps,
                "is_completed": snapshot.is_completed,
                "last_activity_at": to_iso(snapshot.last_activity_at),
                "cohorts": cohort_names_for_user(context, snapshot.user_id, filters.cohort_ids or None),
            }
            if metric == "active_learners":
                if (snapshot.course_id, snapshot.user_id) not in active_pairs:
                    continue
                row["active_in_window"] = True
            rows.append(row)

    paged_rows = rows[filters.offset : filters.offset + filters.page_size]
    return DrillThroughResponse(
        generated_at=to_iso(context.generated_at) or "",
        metric=metric,
        total=len(rows),
        items=paged_rows,
    )
