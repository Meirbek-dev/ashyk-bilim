from __future__ import annotations

from datetime import timedelta

from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    AnalyticsContext,
    build_activity_events,
    cohort_user_ids,
    progress_snapshots,
    safe_pct,
    to_iso,
)
from src.services.analytics.schemas import (
    AssessmentOutlierRow,
    AtRiskLearnerRow,
    ForecastItem,
    TeacherCourseRow,
    TeacherWorkloadSummary,
)


def build_forecasts(
    context: AnalyticsContext,
    filters: AnalyticsFilters,
    *,
    risk_rows: list[AtRiskLearnerRow],
    course_rows: list[TeacherCourseRow],
    assessment_rows: list[AssessmentOutlierRow],
    workload: TeacherWorkloadSummary,
) -> list[ForecastItem]:
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    snapshots = progress_snapshots(context, allowed_user_ids)
    events = build_activity_events(context, allowed_user_ids)
    forecasts: list[ForecastItem] = []
    current_start, current_end = filters.window_bounds(now=context.generated_at)
    elapsed_days = max(1, (current_end - current_start).days)

    for course in course_rows[:12]:
        course_snapshots = [
            snapshot
            for snapshot in snapshots.values()
            if snapshot.course_id == course.course_id
        ]
        active_recent = {
            event.user_id
            for event in events
            if event.course_id == course.course_id
            and event.ts >= context.generated_at - timedelta(days=7)
        }
        unlikely = [
            snapshot
            for snapshot in course_snapshots
            if not snapshot.is_completed
            and snapshot.progress_pct < 70
            and snapshot.user_id not in active_recent
        ]
        if unlikely:
            forecasts.append(
                ForecastItem(
                    id=f"completion-target-miss-{course.course_id}",
                    type="completion_target_miss",
                    severity="critical" if len(unlikely) >= 10 else "warning",
                    title=f"{course.course_name}: learners likely to miss completion target",
                    prediction=f"{len(unlikely)} learners are inactive or below 70% progress.",
                    confidence_level="medium" if len(course_snapshots) >= 10 else "low",
                    course_id=course.course_id,
                    course_name=course.course_name,
                    learner_count=len(unlikely),
                    expected_value=safe_pct(
                        len(course_snapshots) - len(unlikely), len(course_snapshots)
                    ),
                    target_value=70,
                )
            )

        current_completion = course.completion_rate
        completed_now = sum(1 for snapshot in course_snapshots if snapshot.is_completed)
        completion_events = [
            event
            for event in events
            if event.course_id == course.course_id and event.ts >= current_start
        ]
        completion_velocity = completed_now / elapsed_days
        expected_completed = min(
            len(course_snapshots), completed_now + round(completion_velocity * 14)
        )
        expected_completion = safe_pct(expected_completed, len(course_snapshots))
        if expected_completion is not None and len(course_snapshots) >= 5:
            forecasts.append(
                ForecastItem(
                    id=f"course-completion-deadline-{course.course_id}",
                    type="course_completion_deadline",
                    severity="warning"
                    if expected_completion < max(60, current_completion)
                    else "info",
                    title=f"{course.course_name}: projected 14-day completion",
                    prediction=f"Expected completion is {expected_completion}% if current pace continues.",
                    confidence_level="medium" if len(completion_events) >= 5 else "low",
                    course_id=course.course_id,
                    course_name=course.course_name,
                    expected_value=expected_completion,
                    target_value=max(60, current_completion),
                    deadline_at=to_iso(context.generated_at + timedelta(days=14)),
                )
            )

    forecasts.append(
        ForecastItem(
            id="grading-backlog-7d",
            type="grading_backlog_7d",
            severity="critical"
            if workload.forecast_backlog_7d >= 25
            else "warning"
            if workload.forecast_backlog_7d > workload.backlog_total
            else "info",
            title="Expected grading backlog in 7 days",
            prediction=f"Backlog is forecast to reach {workload.forecast_backlog_7d} submissions.",
            confidence_level="medium",
            learner_count=workload.forecast_backlog_7d,
            expected_value=float(workload.forecast_backlog_7d),
            target_value=float(workload.backlog_total),
            deadline_at=to_iso(context.generated_at + timedelta(days=7)),
        )
    )

    for assessment in assessment_rows:
        if assessment.pass_rate is None or assessment.pass_rate >= 75:
            continue
        forecasts.append(
            ForecastItem(
                id=f"assessment-failure-risk-{assessment.assessment_type}-{assessment.assessment_id}",
                type="assessment_failure_risk",
                severity="critical" if assessment.pass_rate < 50 else "warning",
                title=f"{assessment.title}: elevated failure risk",
                prediction=f"Expected failure rate is {round(100 - assessment.pass_rate, 1)}% before the next due date.",
                confidence_level="high"
                if assessment.submission_rate is not None
                and assessment.submission_rate >= 50
                else "medium",
                course_id=assessment.course_id,
                course_name=assessment.course_name,
                assessment_type=assessment.assessment_type,
                assessment_id=assessment.assessment_id,
                expected_value=round(100 - assessment.pass_rate, 1),
                target_value=25,
            )
        )

    severity_score = {"critical": 2, "warning": 1, "info": 0}
    forecasts.sort(
        key=lambda item: (severity_score[item.severity], item.expected_value or 0),
        reverse=True,
    )
    return forecasts[:12]
