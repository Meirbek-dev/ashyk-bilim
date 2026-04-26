from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlmodel import Session

from src.db.analytics import (
    DailyCourseMetrics,
    DailyTeacherMetrics,
    LearnerRiskSnapshot,
)
from src.services.analytics.anomalies import build_anomalies
from src.services.analytics.assessments import build_assessment_rows
from src.services.analytics.bottlenecks import build_content_bottlenecks
from src.services.analytics.courses import build_course_rows
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.forecasting import build_forecasts
from src.services.analytics.insights import build_insight_feed
from src.services.analytics.interventions import summarize_interventions
from src.services.analytics.quality import build_data_quality
from src.services.analytics.queries import (
    ActivityEvent,
    build_activity_events,
    build_series,
    cohort_user_ids,
    direction_for_delta,
    load_analytics_context,
    parse_timestamp,
    progress_snapshots,
    safe_pct,
    to_iso,
    to_tz_iso,
)
from src.services.analytics.risk import build_risk_rows, enrich_risk_rows
from src.services.analytics.rollups import (
    freshness_seconds_from_rollup,
    get_latest_teacher_rollup,
    supports_teacher_rollup_reads,
)
from src.services.analytics.schemas import (
    AlertItem,
    AnalyticsFilterOption,
    MetricCard,
    RiskDistributionCounts,
    TeacherOverviewResponse,
    TeacherOverviewScope,
    TeacherOverviewSummary,
    TeacherOverviewTrends,
    TimeSeriesPoint,
)
from src.services.analytics.scope import TeacherAnalyticsScope
from src.services.analytics.workload import build_teacher_workload


def _metric(
    label: str,
    value: float,
    previous: float | None,
    *,
    unit: str | None = None,
    is_higher_better: bool = True,
    benchmark: float | None = None,
    benchmark_label: str | None = None,
) -> MetricCard:
    delta_value = round(value - previous, 1) if previous is not None else None
    # When previous is 0 and current is non-zero, delta_pct is infinite — return None and
    # let the frontend display "no prior data" rather than the misleading "Stable" label.
    delta_pct = (
        round(((value - previous) / previous) * 100, 1)
        if previous not in (None, 0)
        else None
    )
    return MetricCard(
        value=round(value, 1),
        delta_value=delta_value,
        delta_pct=delta_pct,
        direction=direction_for_delta(delta_value),
        label=label,
        unit=unit,
        is_higher_better=is_higher_better,
        benchmark=round(benchmark, 1) if benchmark is not None else None,
        benchmark_label=benchmark_label,
    )


def _query_previous_at_risk_count(
    db_session: Session, course_ids: list[int], before_date: date
) -> float | None:
    """Return the at-risk learner count from the most recent LearnerRiskSnapshot before *before_date*."""
    latest_date_filters = [LearnerRiskSnapshot.snapshot_date < before_date]
    if course_ids:
        latest_date_filters.append(LearnerRiskSnapshot.course_id.in_(course_ids))
    latest_date_result = db_session.exec(
        select(func.max(LearnerRiskSnapshot.snapshot_date)).where(
            *latest_date_filters,
        )
    ).one_or_none()
    latest_date = latest_date_result if isinstance(latest_date_result, date) else None
    if latest_date is None:
        return None
    filter_clause = [
        LearnerRiskSnapshot.snapshot_date == latest_date,
        LearnerRiskSnapshot.risk_level.in_(["medium", "high"]),
    ]
    if course_ids:
        filter_clause.append(LearnerRiskSnapshot.course_id.in_(course_ids))
    result = db_session.exec(
        select(func.count()).select_from(LearnerRiskSnapshot).where(*filter_clause)
    ).one_or_none()
    return float(result if result is not None else 0)


def _query_previous_negative_engagement(
    db_session: Session, teacher_user_id: int, before_date: date
) -> float | None:
    """Return the courses_with_negative_engagement from the most recent DailyTeacherMetrics before *before_date*."""
    stmt = (
        select(DailyTeacherMetrics)
        .where(
            DailyTeacherMetrics.teacher_user_id == teacher_user_id,
            DailyTeacherMetrics.metric_date < before_date,
        )
        .order_by(DailyTeacherMetrics.metric_date.desc())
        .limit(1)
    )
    row = db_session.exec(stmt).first()
    return float(row.courses_with_negative_engagement) if row is not None else None


def _query_previous_teacher_metrics(
    db_session: Session, teacher_user_id: int, before_date: date
) -> DailyTeacherMetrics | None:
    stmt = (
        select(DailyTeacherMetrics)
        .where(
            DailyTeacherMetrics.teacher_user_id == teacher_user_id,
            DailyTeacherMetrics.metric_date < before_date,
        )
        .order_by(DailyTeacherMetrics.metric_date.desc())
        .limit(1)
    )
    return db_session.exec(stmt).first()


def _query_previous_course_metric_sum(
    db_session: Session,
    course_ids: list[int],
    before_date: date,
    metric_name: str,
) -> float | None:
    if not course_ids:
        return None
    latest_date_result = db_session.exec(
        select(func.max(DailyCourseMetrics.metric_date)).where(
            DailyCourseMetrics.metric_date < before_date,
            DailyCourseMetrics.course_id.in_(course_ids),
        )
    ).one_or_none()
    latest_date = latest_date_result if isinstance(latest_date_result, date) else None
    if latest_date is None:
        return None
    column = getattr(DailyCourseMetrics, metric_name)
    value = db_session.exec(
        select(func.coalesce(func.sum(column), 0)).where(
            DailyCourseMetrics.metric_date == latest_date,
            DailyCourseMetrics.course_id.in_(course_ids),
        )
    ).one_or_none()
    return float(value) if value is not None else 0.0


def _query_previous_negative_engagement_for_courses(
    db_session: Session, course_ids: list[int], before_date: date
) -> float | None:
    if not course_ids:
        return None
    latest_date_result = db_session.exec(
        select(func.max(DailyCourseMetrics.metric_date)).where(
            DailyCourseMetrics.metric_date < before_date,
            DailyCourseMetrics.course_id.in_(course_ids),
        )
    ).one_or_none()
    latest_date = latest_date_result if isinstance(latest_date_result, date) else None
    if latest_date is None:
        return None
    result = db_session.exec(
        select(func.count()).select_from(DailyCourseMetrics).where(
            DailyCourseMetrics.metric_date == latest_date,
            DailyCourseMetrics.course_id.in_(course_ids),
            DailyCourseMetrics.engagement_delta_pct < 0,
        )
    ).one_or_none()
    return float(result if result is not None else 0)


def _teacher_rollup_id(scope: TeacherAnalyticsScope, filters: AnalyticsFilters) -> int:
    if scope.has_platform_scope and filters.teacher_user_id is None:
        return 0
    return scope.teacher_user_id


def get_teacher_overview(
    db_session: Session, scope: TeacherAnalyticsScope, filters: AnalyticsFilters
) -> TeacherOverviewResponse:
    # Pre-compute window bounds so we can pass them as date filters to load_analytics_context,
    # avoiding a full unbounded pull of TrailStep/TrailRun for every period.
    now = None  # will be resolved inside window_bounds using system clock
    _pre_start, _pre_end = filters.window_bounds(now=now)
    previous_start_pre, _ = filters.previous_window_bounds(now=now)
    # Fetch data starting from the previous period so delta calculations have the earlier data.
    context = load_analytics_context(
        db_session, scope.course_ids, activity_start=previous_start_pre
    )
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    events = build_activity_events(context, allowed_user_ids)
    snapshots = progress_snapshots(context, allowed_user_ids)
    risk_rows = enrich_risk_rows(
        db_session,
        scope,
        build_risk_rows(context, filters),
        generated_date=context.generated_at.date(),
    )
    generated_at = context.generated_at
    current_start, current_end = filters.window_bounds(now=generated_at)
    previous_start, previous_end = filters.previous_window_bounds(now=generated_at)

    current_active_users = {
        event.user_id for event in events if event.ts >= current_start
    }
    previous_active_users = {
        event.user_id for event in events if previous_start <= event.ts < previous_end
    }
    returning_learners = len(current_active_users & previous_active_users)
    previous_returning = len(
        {event.user_id for event in events if previous_start <= event.ts < previous_end}
        & {
            event.user_id
            for event in events
            if (previous_start - timedelta(days=filters.window_days))
            <= event.ts
            < previous_start
        }
    )
    teacher_rollup = None
    teacher_rollup_id = _teacher_rollup_id(scope, filters)
    if supports_teacher_rollup_reads(filters):
        teacher_rollup = get_latest_teacher_rollup(
            db_session,
            teacher_user_id=teacher_rollup_id,
        )

    enrolled = len(snapshots)
    completion_rate = (
        safe_pct(
            sum(1 for snapshot in snapshots.values() if snapshot.is_completed), enrolled
        )
        or 0.0
    )
    # Previous-period completion rate: count learners who completed and whose last activity
    # was before the current window start (proxy for "completed before this period").
    # Use all enrolled as denominator to keep it comparable to the current period rate.
    previous_completions = sum(
        1
        for snapshot in snapshots.values()
        if snapshot.is_completed
        and snapshot.last_activity_at is not None
        and snapshot.last_activity_at < current_start
    )
    previous_completion_rate = safe_pct(previous_completions, enrolled) or 0.0
    at_risk_count = sum(1 for row in risk_rows if row.risk_level in {"medium", "high"})
    # Query the most recent LearnerRiskSnapshot before the current window to get a real previous value.
    previous_at_risk = _query_previous_at_risk_count(
        db_session, scope.course_ids, previous_end.date()
    )
    previous_teacher_metrics = (
        _query_previous_teacher_metrics(
            db_session, teacher_rollup_id, previous_end.date()
        )
        if supports_teacher_rollup_reads(filters)
        else None
    )
    ungraded_submissions = sum(
        1
        for submission, _assignment in context.assignment_submissions
        if submission.submission_status.value in {"SUBMITTED", "LATE"}
        and (allowed_user_ids is None or submission.user_id in allowed_user_ids)
    )

    # Pass shared context to avoid a second full load inside build_course_rows
    generated_rows_timestamp, course_rows = build_course_rows(
        scope, filters, db_session, context=context
    )
    assessment_rows = build_assessment_rows(context, filters)
    workload = build_teacher_workload(context, filters)
    content_bottlenecks = build_content_bottlenecks(context, filters)
    rollup_freshness_seconds = freshness_seconds_from_rollup(
        teacher_rollup.generated_at if teacher_rollup is not None else None
    )
    data_quality = build_data_quality(
        db_session,
        scope,
        filters,
        context,
        freshness_seconds=rollup_freshness_seconds,
    )
    forecasts = build_forecasts(
        context,
        filters,
        risk_rows=risk_rows,
        course_rows=course_rows,
        assessment_rows=assessment_rows,
        workload=workload,
    )
    anomalies = build_anomalies(
        context,
        filters,
        course_rows=course_rows,
        assessment_rows=assessment_rows,
    )
    negative_engagement_courses = sum(
        1
        for row in course_rows
        if row.engagement_delta_pct is not None and row.engagement_delta_pct < 0
    )
    # Query the previous period's DailyTeacherMetrics to get actual previous value instead of hardcoded 0.
    previous_negative_engagement = (
        _query_previous_negative_engagement(
            db_session, teacher_rollup_id, previous_end.date()
        )
        if supports_teacher_rollup_reads(filters)
        else _query_previous_negative_engagement_for_courses(
            db_session, scope.course_ids, previous_end.date()
        )
    )
    previous_ungraded_submissions = (
        float(previous_teacher_metrics.ungraded_submissions)
        if previous_teacher_metrics is not None
        else _query_previous_course_metric_sum(
            db_session,
            scope.course_ids,
            previous_end.date(),
            "ungraded_submissions",
        )
    )

    completions_events = []
    for snapshot in snapshots.values():
        if snapshot.is_completed and snapshot.last_activity_at is not None:
            completions_events.append(
                ActivityEvent(
                    user_id=snapshot.user_id,
                    course_id=snapshot.course_id,
                    ts=snapshot.last_activity_at,
                    source="completion",
                )
            )
    submission_events = [
        event
        for event in events
        if event.source in {"assignment", "quiz", "exam", "code_challenge"}
    ]
    grading_events = []
    for submission, assignment in context.assignment_submissions:
        if allowed_user_ids is not None and submission.user_id not in allowed_user_ids:
            continue
        if submission.submission_status.value != "GRADED":
            continue
        graded_at = getattr(submission, "graded_at", None) or submission.update_date
        ts = parse_timestamp(graded_at)
        if ts is None:
            continue
        grading_events.append(
            ActivityEvent(
                user_id=submission.user_id,
                course_id=assignment.course_id,
                ts=ts,
                source="graded_assignment",
            )
        )

    trends = TeacherOverviewTrends(
        active_learners=[
            TimeSeriesPoint(
                bucket_start=to_tz_iso(bucket, filters.tzinfo) or "", value=value
            )
            for bucket, value in build_series(
                events,
                filters.bucket,
                current_start,
                current_end,
                distinct_users=True,
                tzinfo=filters.tzinfo,
            )
        ],
        completions=[
            TimeSeriesPoint(
                bucket_start=to_tz_iso(bucket, filters.tzinfo) or "", value=value
            )
            for bucket, value in build_series(
                completions_events,
                filters.bucket,
                current_start,
                current_end,
                tzinfo=filters.tzinfo,
            )
        ],
        submissions=[
            TimeSeriesPoint(
                bucket_start=to_tz_iso(bucket, filters.tzinfo) or "", value=value
            )
            for bucket, value in build_series(
                submission_events,
                filters.bucket,
                current_start,
                current_end,
                tzinfo=filters.tzinfo,
            )
        ],
        grading_completed=[
            TimeSeriesPoint(
                bucket_start=to_tz_iso(bucket, filters.tzinfo) or "", value=value
            )
            for bucket, value in build_series(
                grading_events,
                filters.bucket,
                current_start,
                current_end,
                tzinfo=filters.tzinfo,
            )
        ],
    )

    alerts: list[AlertItem] = []
    for row in course_rows:
        if row.top_alert is not None:
            alerts.append(row.top_alert)
    if at_risk_count > 0:
        alerts.append(
            AlertItem(
                id="risk-overview",
                type="risk_spike",
                severity="critical" if at_risk_count >= 15 else "warning",
                title="Риск учащихся требует вмешательства",
                body=f"{at_risk_count} учащихся в текущем охвате имеют средний или высокий уровень риска.",
                learner_count=at_risk_count,
            )
        )
    alerts = sorted(
        alerts,
        key=lambda alert: {"critical": 2, "warning": 1, "info": 0}[alert.severity],
        reverse=True,
    )[:8]

    risk_distribution = RiskDistributionCounts(
        high=sum(1 for row in risk_rows if row.risk_level == "high"),
        medium=sum(1 for row in risk_rows if row.risk_level == "medium"),
        low=sum(1 for row in risk_rows if row.risk_level == "low"),
    )

    return TeacherOverviewResponse(
        generated_at=to_iso(generated_at) or generated_rows_timestamp,
        # For live queries, freshness is how long data is "stale" within the window (always live = 0).
        # Report the age of the rollup if one exists; otherwise report 0 indicating real-time live data.
        freshness_seconds=rollup_freshness_seconds,
        window=filters.window,
        compare=filters.compare,
        scope=TeacherOverviewScope(
            teacher_user_id=scope.teacher_user_id,
            course_ids=scope.course_ids,
            cohort_ids=scope.cohort_ids,
        ),
        summary=TeacherOverviewSummary(
            active_learners=_metric(
                "Активные учащиеся",
                float(
                    teacher_rollup.active_learners_7d
                    if teacher_rollup is not None and filters.window == "7d"
                    else teacher_rollup.active_learners_28d
                    if teacher_rollup is not None and filters.window == "28d"
                    else teacher_rollup.active_learners_90d
                    if teacher_rollup is not None and filters.window == "90d"
                    else len(current_active_users)
                ),
                float(len(previous_active_users)),
                is_higher_better=True,
            ),
            returning_learners=_metric(
                "Вернувшиеся учащиеся",
                # Only use the 28d rollup when the window is actually 28d; otherwise use live computation.
                float(
                    teacher_rollup.returning_learners_28d
                    if teacher_rollup is not None and filters.window == "28d"
                    else returning_learners
                ),
                float(previous_returning),
                is_higher_better=True,
            ),
            completion_rate=_metric(
                "Доля завершения",
                float(
                    teacher_rollup.completion_rate
                    if teacher_rollup is not None
                    and teacher_rollup.completion_rate is not None
                    else completion_rate
                ),
                float(previous_completion_rate),
                unit="%",
                is_higher_better=True,
                # Platform benchmark: median completion rate across all scoped courses.
                benchmark=round(
                    sorted([row.completion_rate for row in course_rows])[
                        len(course_rows) // 2
                    ],
                    1,
                )
                if course_rows
                else None,
                benchmark_label="Медиана по курсам",
            ),
            at_risk_learners=_metric(
                "Учащиеся в зоне риска",
                float(
                    teacher_rollup.at_risk_learners
                    if teacher_rollup is not None
                    else at_risk_count
                ),
                float(previous_at_risk) if previous_at_risk is not None else None,
                is_higher_better=False,
                # Benchmark: share of enrolled learners that are at risk (to contextualise the raw count).
                benchmark=round(safe_pct(at_risk_count, enrolled) or 0.0, 1)
                if enrolled
                else None,
                benchmark_label="% от зачисленных",
            ),
            ungraded_submissions=_metric(
                "Непроверенные отправки",
                float(
                    teacher_rollup.ungraded_submissions
                    if teacher_rollup is not None
                    else ungraded_submissions
                ),
                previous_ungraded_submissions,
                is_higher_better=False,
            ),
            negative_engagement_courses=_metric(
                "Курсы со снижением вовлеченности",
                float(
                    teacher_rollup.courses_with_negative_engagement
                    if teacher_rollup is not None
                    else negative_engagement_courses
                ),
                float(previous_negative_engagement)
                if previous_negative_engagement is not None
                else None,
                is_higher_better=False,
                # Benchmark: share of all scoped courses with negative engagement.
                benchmark=round(
                    safe_pct(negative_engagement_courses, len(course_rows)) or 0.0, 1
                )
                if course_rows
                else None,
                benchmark_label="% от курсов",
            ),
        ),
        trends=trends,
        alerts=alerts,
        insights=build_insight_feed(
            risk_rows=risk_rows,
            course_rows=course_rows,
            assessment_rows=assessment_rows,
            bottlenecks=content_bottlenecks,
            workload=workload,
        ),
        data_quality=data_quality,
        forecasts=forecasts,
        anomalies=anomalies,
        risk_distribution=risk_distribution,
        intervention_summary=summarize_interventions(db_session, scope),
        workload=workload,
        content_bottlenecks=content_bottlenecks,
        at_risk_preview=risk_rows[:8],
        course_preview=course_rows[:8],
        assessment_preview=assessment_rows[:8],
        course_total=len(course_rows),
        assessment_total=len(assessment_rows),
        at_risk_total=len(risk_rows),
        course_options=[
            AnalyticsFilterOption(
                label=context.courses_by_id[course_id].name, value=str(course_id)
            )
            for course_id in sorted(context.courses_by_id)
            if course_id in scope.course_ids
        ],
        cohort_options=[
            AnalyticsFilterOption(label=name, value=str(group_id))
            for group_id, name in sorted(
                context.usergroup_names_by_id.items(), key=lambda item: item[1].lower()
            )
        ],
    )
