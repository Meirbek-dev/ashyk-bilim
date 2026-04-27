from __future__ import annotations

from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    AnalyticsContext,
    assignment_graded_at,
    assignment_is_graded,
    assignment_is_reviewable,
    assignment_submission_status,
    assignment_submitted_at,
    cohort_user_ids,
    display_name,
    hours_between,
    median_or_none,
    parse_timestamp,
    to_iso,
)
from src.services.analytics.schemas import (
    GradingBacklogItem,
    TeacherWorkloadSummary,
    WorkloadAgingBuckets,
)

GRADING_SLA_HOURS = 72


def build_teacher_workload(
    context: AnalyticsContext, filters: AnalyticsFilters
) -> TeacherWorkloadSummary:
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    generated_at = context.generated_at
    current_start, current_end = filters.window_bounds(now=generated_at)

    backlog_by_assignment: dict[int, dict[str, object]] = {}
    latency_hours: list[float] = []
    backlog_total = 0
    sla_breaches = 0
    aging = WorkloadAgingBuckets()
    submitted_in_window = 0
    graded_in_window = 0

    for submission, assignment in context.assignment_submissions:
        if allowed_user_ids is not None and submission.user_id not in allowed_user_ids:
            continue

        submitted_at = parse_timestamp(assignment_submitted_at(submission))
        graded_at = parse_timestamp(assignment_graded_at(submission))
        if submitted_at is not None and current_start <= submitted_at <= current_end:
            submitted_in_window += 1
        if graded_at is not None and current_start <= graded_at <= current_end:
            graded_in_window += 1

        if assignment_is_graded(submission):
            latency = hours_between(submitted_at, graded_at)
            if latency is not None:
                latency_hours.append(latency)
            continue

        if not assignment_is_reviewable(submission):
            continue

        backlog_total += 1
        age_hours = (
            round((generated_at - submitted_at).total_seconds() / 3600, 2)
            if submitted_at is not None and generated_at >= submitted_at
            else None
        )
        is_breach = age_hours is not None and age_hours > GRADING_SLA_HOURS
        if is_breach:
            sla_breaches += 1
        if age_hours is None or age_hours <= 24:
            aging.h0_24 += 1
        elif age_hours <= 72:
            aging.d1_3 += 1
        elif age_hours <= 168:
            aging.d3_7 += 1
        else:
            aging.d7_plus += 1

        course = context.courses_by_id.get(assignment.course_id)
        item = backlog_by_assignment.setdefault(
            assignment.id or 0,
            {
                "course_id": assignment.course_id,
                "course_name": course.name if course is not None else "Unknown course",
                "assessment_id": assignment.id or 0,
                "title": assignment.title,
                "awaiting_review": 0,
                "oldest_submitted_at": submitted_at,
                "max_age_hours": age_hours,
                "sla_breaches": 0,
            },
        )
        item["awaiting_review"] = int(item["awaiting_review"]) + 1
        if is_breach:
            item["sla_breaches"] = int(item["sla_breaches"]) + 1
        if submitted_at is not None:
            oldest = item.get("oldest_submitted_at")
            if oldest is None or submitted_at < oldest:
                item["oldest_submitted_at"] = submitted_at
        if age_hours is not None:
            current_age = item.get("max_age_hours")
            if current_age is None or age_hours > float(current_age):
                item["max_age_hours"] = age_hours

    daily_inflow = submitted_in_window / max(1, filters.window_days)
    daily_grading = graded_in_window / max(1, filters.window_days)
    forecast_backlog = max(0, round(backlog_total + ((daily_inflow - daily_grading) * 7)))

    backlog_rows = [
        GradingBacklogItem(
            course_id=int(item["course_id"]),
            course_name=str(item["course_name"]),
            assessment_id=int(item["assessment_id"]),
            assessment_type="assignment",
            title=str(item["title"]),
            awaiting_review=int(item["awaiting_review"]),
            oldest_submitted_at=to_iso(item.get("oldest_submitted_at")),
            age_hours=round(float(item["max_age_hours"]), 2)
            if item.get("max_age_hours") is not None
            else None,
            sla_breaches=int(item["sla_breaches"]),
        )
        for item in backlog_by_assignment.values()
    ]
    backlog_rows.sort(
        key=lambda row: (row.sla_breaches, row.age_hours or 0, row.awaiting_review),
        reverse=True,
    )

    return TeacherWorkloadSummary(
        backlog_total=backlog_total,
        sla_breaches=sla_breaches,
        median_feedback_latency_hours=median_or_none(latency_hours),
        aging_buckets=aging,
        forecast_backlog_7d=forecast_backlog,
        backlog_by_assignment=backlog_rows[:25],
    )


def backlog_items_for_drillthrough(
    context: AnalyticsContext, filters: AnalyticsFilters
) -> list[dict[str, object]]:
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    rows: list[dict[str, object]] = []
    generated_at = context.generated_at
    for submission, assignment in context.assignment_submissions:
        if allowed_user_ids is not None and submission.user_id not in allowed_user_ids:
            continue
        if not assignment_is_reviewable(submission):
            continue
        submitted_at = parse_timestamp(assignment_submitted_at(submission))
        age_hours = (
            round((generated_at - submitted_at).total_seconds() / 3600, 2)
            if submitted_at is not None
            else None
        )
        user = context.users_by_id.get(submission.user_id)
        course = context.courses_by_id.get(assignment.course_id)
        rows.append({
            "submission_id": submission.id or 0,
            "assignment_id": assignment.id or 0,
            "assignment_title": assignment.title,
            "course_id": assignment.course_id,
            "course_name": course.name if course is not None else "Unknown course",
            "user_id": submission.user_id,
            "user_display_name": display_name(user),
            "status": assignment_submission_status(submission),
            "submitted_at": to_iso(submitted_at),
            "age_hours": age_hours,
            "sla_breached": age_hours is not None and age_hours > GRADING_SLA_HOURS,
        })
    rows.sort(key=lambda row: row.get("age_hours") or 0, reverse=True)
    return rows
