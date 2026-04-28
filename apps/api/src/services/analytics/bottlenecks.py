from __future__ import annotations

from collections import defaultdict

from src.db.grading.progress import ActivityProgressState
from src.services.analytics.assessments import build_assessment_rows
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    AnalyticsContext,
    cohort_user_ids,
    course_last_content_update,
    parse_timestamp,
    safe_pct,
)
from src.services.analytics.schemas import ContentBottleneckRow


def _time_spent_seconds(
    data: dict | None, created: object, updated: object
) -> float | None:
    payload = data or {}
    for key in (
        "time_spent_seconds",
        "timeSpentSeconds",
        "duration_seconds",
        "durationSeconds",
    ):
        raw = payload.get(key)
        try:
            if raw is not None:
                value = float(raw)
                return value if value >= 0 else None
        except TypeError, ValueError:
            continue
    created_at = parse_timestamp(created)
    updated_at = parse_timestamp(updated)
    if created_at is None or updated_at is None or updated_at < created_at:
        return None
    return min((updated_at - created_at).total_seconds(), 6 * 3600)


def build_content_bottlenecks(
    context: AnalyticsContext,
    filters: AnalyticsFilters,
    *,
    course_id: int | None = None,
    limit: int = 12,
) -> list[ContentBottleneckRow]:
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    target_course_ids = (
        {course_id} if course_id is not None else set(context.courses_by_id)
    )
    started_by_activity: dict[int, set[int]] = defaultdict(set)
    completed_by_activity: dict[int, set[int]] = defaultdict(set)
    time_by_activity: dict[int, list[float]] = defaultdict(list)

    for progress in context.activity_progress:
        if progress.course_id not in target_course_ids:
            continue
        if allowed_user_ids is not None and progress.user_id not in allowed_user_ids:
            continue
        if str(progress.state) != ActivityProgressState.NOT_STARTED.value:
            started_by_activity[progress.activity_id].add(progress.user_id)
        if progress.completed_at is not None or str(progress.state) in {
            ActivityProgressState.COMPLETED.value,
            ActivityProgressState.PASSED.value,
        }:
            completed_by_activity[progress.activity_id].add(progress.user_id)

    for step in context.trail_steps:
        if step.course_id not in target_course_ids:
            continue
        if allowed_user_ids is not None and step.user_id not in allowed_user_ids:
            continue
        time_spent = _time_spent_seconds(
            step.data, step.creation_date, step.update_date
        )
        if time_spent is not None:
            time_by_activity[step.activity_id].append(time_spent)

    assessment_rows = [
        row
        for row in build_assessment_rows(context, filters)
        if row.course_id in target_course_ids and row.activity_id is not None
    ]
    assessments_by_activity = defaultdict(list)
    for row in assessment_rows:
        assessments_by_activity[row.activity_id].append(row)

    rows: list[ContentBottleneckRow] = []
    for activity_id, activity in sorted(context.activities_by_id.items()):
        if activity.course_id not in target_course_ids:
            continue
        course = context.courses_by_id.get(activity.course_id or 0)
        if course is None:
            continue
        started = len(started_by_activity.get(activity_id, set()))
        completed = len(completed_by_activity.get(activity_id, set()))
        completion_rate = safe_pct(completed, started) if started else None
        avg_time = (
            round(
                sum(time_by_activity[activity_id]) / len(time_by_activity[activity_id]),
                1,
            )
            if time_by_activity.get(activity_id)
            else None
        )
        exit_count = max(0, started - completed)
        exit_rate = safe_pct(exit_count, started) if started else None

        if (
            started >= 3
            and completion_rate is not None
            and completion_rate < 60
            and avg_time is not None
            and avg_time >= 900
        ):
            rows.append(
                ContentBottleneckRow(
                    course_id=course.id or 0,
                    course_name=course.name,
                    activity_id=activity_id,
                    activity_name=activity.name,
                    activity_type=activity.activity_type.value,
                    signal="high_time_low_completion",
                    severity="critical" if completion_rate < 40 else "warning",
                    completion_rate=completion_rate,
                    started_learners=started,
                    completed_learners=completed,
                    avg_time_seconds=avg_time,
                    exit_count=exit_count,
                    note="Learners spend substantial time here, but fewer than expected complete it.",
                )
            )

        if started >= 3 and exit_rate is not None and exit_rate >= 35:
            rows.append(
                ContentBottleneckRow(
                    course_id=course.id or 0,
                    course_name=course.name,
                    activity_id=activity_id,
                    activity_name=activity.name,
                    activity_type=activity.activity_type.value,
                    signal="exit_after_open",
                    severity="critical" if exit_rate >= 60 else "warning",
                    completion_rate=completion_rate,
                    started_learners=started,
                    completed_learners=completed,
                    avg_time_seconds=avg_time,
                    exit_count=exit_count,
                    note="Many learners open this activity and leave before completing it.",
                )
            )

        weak_assessments = [
            row
            for row in assessments_by_activity.get(activity_id, [])
            if row.pass_rate is not None and row.pass_rate < 60
        ]
        if weak_assessments:
            failed = sum(
                max(1, round((100 - (row.pass_rate or 0)) / 100 * max(1, started)))
                for row in weak_assessments
            )
            rows.append(
                ContentBottleneckRow(
                    course_id=course.id or 0,
                    course_name=course.name,
                    activity_id=activity_id,
                    activity_name=activity.name,
                    activity_type=activity.activity_type.value,
                    signal="repeated_assessment_failures",
                    severity="critical"
                    if min(row.pass_rate or 100 for row in weak_assessments) < 40
                    else "warning",
                    completion_rate=completion_rate,
                    started_learners=started,
                    completed_learners=completed,
                    avg_time_seconds=avg_time,
                    exit_count=exit_count,
                    failed_assessments=failed,
                    note="Assessment performance drops around this activity.",
                )
            )

        last_update = course_last_content_update(context, activity.course_id or 0)
        stale_days = (
            (context.generated_at - last_update).days
            if last_update is not None
            else None
        )
        if (
            stale_days is not None
            and stale_days >= 45
            and (
                (completion_rate is not None and completion_rate < 65)
                or any(
                    (row.pass_rate or 100) < 65
                    for row in assessments_by_activity.get(activity_id, [])
                )
            )
        ):
            rows.append(
                ContentBottleneckRow(
                    course_id=course.id or 0,
                    course_name=course.name,
                    activity_id=activity_id,
                    activity_name=activity.name,
                    activity_type=activity.activity_type.value,
                    signal="stale_low_performance",
                    severity="critical" if stale_days >= 90 else "warning",
                    completion_rate=completion_rate,
                    started_learners=started,
                    completed_learners=completed,
                    avg_time_seconds=avg_time,
                    exit_count=exit_count,
                    stale_days=stale_days,
                    note="Older content is correlated with lower progress or assessment outcomes.",
                )
            )

    severity_score = {"critical": 2, "warning": 1, "info": 0}
    rows.sort(
        key=lambda row: (
            severity_score[row.severity],
            row.exit_count + row.failed_assessments,
            row.avg_time_seconds or 0,
        ),
        reverse=True,
    )
    return rows[:limit]
