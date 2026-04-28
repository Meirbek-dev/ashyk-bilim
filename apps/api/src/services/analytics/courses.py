from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlmodel import Session

from src.db.analytics import DailyCourseMetrics
from src.db.courses.courses import Course
from src.db.grading.progress import ActivityProgress, ActivityProgressState
from src.db.usergroups import UserGroup
from src.services.analytics.assessments import build_assessment_rows
from src.services.analytics.bottlenecks import build_content_bottlenecks
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    assignment_is_reviewable,
    build_activity_events,
    build_series,
    cohort_user_ids,
    course_last_content_update,
    load_analytics_context,
    progress_snapshots,
    safe_pct,
    to_iso,
    to_tz_iso,
)
from src.services.analytics.risk import build_risk_rows, enrich_risk_rows
from src.services.analytics.rollups import (
    list_latest_assessment_rollups,
    list_latest_course_rollups,
    supports_rollup_reads,
)
from src.services.analytics.schemas import (
    ActivityDropoffRow,
    AlertItem,
    AnalyticsFilterOption,
    ContentHealthRow,
    FunnelStep,
    TeacherCourseDetailResponse,
    TeacherCourseDetailSummary,
    TeacherCourseListResponse,
    TeacherCourseRow,
    TimeSeriesPoint,
)
from src.services.analytics.scope import TeacherAnalyticsScope, ensure_course_in_scope


def _activity_progress_completed(progress: ActivityProgress) -> bool:
    return progress.completed_at is not None or str(progress.state) in {
        ActivityProgressState.COMPLETED.value,
        ActivityProgressState.PASSED.value,
    }


def _previous_completion_by_course(
    db_session: Session, course_ids: list[int], before_date: date
) -> dict[int, float]:
    if not course_ids:
        return {}
    latest_date = db_session.exec(
        select(func.max(DailyCourseMetrics.metric_date)).where(
            DailyCourseMetrics.metric_date < before_date,
            DailyCourseMetrics.course_id.in_(course_ids),
        )
    ).scalar_one_or_none()
    if latest_date is None:
        return {}
    rows = db_session.exec(
        select(DailyCourseMetrics).where(
            DailyCourseMetrics.metric_date == latest_date,
            DailyCourseMetrics.course_id.in_(course_ids),
        )
    ).all()
    return {
        row.course_id: float(row.completion_rate)
        for row in rows
        if row.completion_rate is not None
    }


def _build_rollup_course_rows(
    scope: TeacherAnalyticsScope, filters: AnalyticsFilters, db_session: Session
) -> tuple[str, list[TeacherCourseRow]] | None:
    if not supports_rollup_reads(filters):
        return None
    teacher_filter_id = (
        scope.teacher_user_id
        if filters.teacher_user_id is not None or not scope.has_platform_scope
        else None
    )
    rollups = list_latest_course_rollups(
        db_session,
        course_ids=scope.course_ids,
        teacher_user_id=teacher_filter_id,
    )
    if not rollups:
        return None

    assessment_rollups = list_latest_assessment_rollups(
        db_session, course_ids=scope.course_ids
    )
    difficulty_by_course: dict[int, list[float]] = defaultdict(list)
    for assessment in assessment_rollups:
        if assessment.difficulty_score is not None:
            difficulty_by_course[assessment.course_id].append(
                float(assessment.difficulty_score)
            )

    courses = {
        course.id: course
        for course in db_session.exec(
            select(Course).where(
                Course.id.in_([rollup.course_id for rollup in rollups])
            )
        ).all()
    }

    rows: list[TeacherCourseRow] = []
    for rollup in rollups:
        course = courses.get(rollup.course_id)
        if course is None:
            continue
        difficulty_values = difficulty_by_course.get(rollup.course_id, [])
        top_alert = None
        if rollup.ungraded_submissions >= 10:
            top_alert = AlertItem(
                id=f"grading-backlog-{rollup.course_id}",
                type="grading_backlog",
                severity="warning" if rollup.ungraded_submissions < 25 else "critical",
                title="Очередь проверки требует внимания",
                body=f"{rollup.ungraded_submissions} отправок все еще ожидают проверки.",
                course_id=rollup.course_id,
            )
        elif (
            rollup.engagement_delta_pct is not None
            and float(rollup.engagement_delta_pct) < -15
        ):
            top_alert = AlertItem(
                id=f"engagement-drop-{rollup.course_id}",
                type="engagement_drop",
                severity="warning",
                title="Вовлеченность снизилась",
                body=f"Количество активных учащихся снизилось на {abs(float(rollup.engagement_delta_pct))}% по сравнению с предыдущим периодом.",
                course_id=rollup.course_id,
            )

        rows.append(
            TeacherCourseRow(
                course_id=rollup.course_id,
                course_uuid=course.course_uuid,
                course_name=course.name,
                active_learners_7d=rollup.active_learners_7d,
                completion_rate=float(rollup.completion_rate or 0),
                engagement_delta_pct=float(rollup.engagement_delta_pct)
                if rollup.engagement_delta_pct is not None
                else None,
                at_risk_learners=rollup.at_risk_learners,
                ungraded_submissions=rollup.ungraded_submissions,
                content_health_score=float(rollup.content_health_score or 0),
                assessment_difficulty_score=round(
                    sum(difficulty_values) / len(difficulty_values), 1
                )
                if difficulty_values
                else None,
                last_content_update_at=to_iso(rollup.last_content_update_at),
                top_alert=top_alert,
            )
        )

    sort_by = filters.sort_by or "pressure"
    if rows:
        average_completion = round(
            sum(row.completion_rate for row in rows) / len(rows), 1
        )
        completion_values = sorted(row.completion_rate for row in rows)
        median_completion = completion_values[len(completion_values) // 2]
        rows = [
            row.model_copy(
                update={
                    "teacher_completion_delta_pct": round(
                        row.completion_rate - average_completion, 1
                    ),
                    "platform_completion_delta_pct": round(
                        row.completion_rate - median_completion, 1
                    ),
                }
            )
            for row in rows
        ]
    reverse = filters.sort_order != "asc"
    sort_map = {
        "name": lambda row: row.course_name.lower(),
        "active": lambda row: row.active_learners_7d,
        "completion": lambda row: row.completion_rate,
        "risk": lambda row: row.at_risk_learners,
        "health": lambda row: row.content_health_score,
        "engagement": lambda row: (
            row.engagement_delta_pct
            if row.engagement_delta_pct is not None
            else -10_000
        ),
        "pressure": lambda row: (
            row.top_alert is not None,
            row.at_risk_learners,
            -row.content_health_score,
        ),
    }
    rows.sort(key=sort_map.get(sort_by, sort_map["pressure"]), reverse=reverse)
    generated_at = max((rollup.generated_at for rollup in rollups), default=None)
    return to_iso(generated_at) or "", rows


def build_course_rows(
    scope: TeacherAnalyticsScope,
    filters: AnalyticsFilters,
    db_session: Session,
    context=None,
) -> tuple[str, list[TeacherCourseRow]]:
    if context is None:
        context = load_analytics_context(db_session, scope.course_ids)
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    events = build_activity_events(context, allowed_user_ids)
    snapshots = progress_snapshots(context, allowed_user_ids)
    all_snapshots = progress_snapshots(context)
    risk_rows = build_risk_rows(context, filters)
    assessments = build_assessment_rows(context, filters)
    now = context.generated_at
    current_start, _current_end = filters.window_bounds(now=now)
    previous_start, previous_end = filters.previous_window_bounds(now=now)
    previous_completion = _previous_completion_by_course(
        db_session, scope.course_ids, current_start.date()
    )
    risk_by_course = defaultdict(list)
    for row in risk_rows:
        risk_by_course[row.course_id].append(row)
    assessments_by_course = defaultdict(list)
    for assessment in assessments:
        assessments_by_course[assessment.course_id].append(assessment)
    all_completion_by_course: dict[int, float] = {}

    rows: list[TeacherCourseRow] = []
    for course_id in scope.course_ids:
        course = context.courses_by_id.get(course_id)
        if course is None:
            continue
        current_active = {
            event.user_id
            for event in events
            if event.course_id == course_id and event.ts >= current_start
        }
        previous_active = {
            event.user_id
            for event in events
            if event.course_id == course_id
            and previous_start <= event.ts < previous_end
        }
        course_snapshots = [
            snapshot for key, snapshot in snapshots.items() if key[0] == course_id
        ]
        all_course_snapshots = [
            snapshot for key, snapshot in all_snapshots.items() if key[0] == course_id
        ]
        completion_rate = (
            safe_pct(
                sum(1 for snapshot in course_snapshots if snapshot.is_completed),
                len(course_snapshots),
            )
            or 0.0
        )
        all_completion_by_course[course_id] = (
            safe_pct(
                sum(1 for snapshot in all_course_snapshots if snapshot.is_completed),
                len(all_course_snapshots),
            )
            or 0.0
        )
        avg_progress = (
            round(
                sum(snapshot.progress_pct for snapshot in course_snapshots)
                / len(course_snapshots),
                1,
            )
            if course_snapshots
            else 0.0
        )
        at_risk_count = sum(
            1
            for row in risk_by_course.get(course_id, [])
            if row.risk_level in {"medium", "high"}
        )
        ungraded_submissions = sum(
            1
            for submission, assignment in context.assignment_submissions
            if assignment.course_id == course_id
            and assignment_is_reviewable(submission)
            and (allowed_user_ids is None or submission.user_id in allowed_user_ids)
        )
        last_update = course_last_content_update(context, course_id)
        days_since_update = (
            (now - last_update).days if last_update is not None else None
        )
        # No update history means the course may be very stale; treat as 90-day old content
        freshness_score = (
            max(0.0, round(100 - (90 * 3.5), 1))
            if days_since_update is None
            else max(0.0, round(100 - (days_since_update * 3.5), 1))
        )
        content_health_score = round(
            (freshness_score * 0.55) + (avg_progress * 0.45), 1
        )
        engagement_delta_pct = None
        if previous_active:
            engagement_delta_pct = round(
                ((len(current_active) - len(previous_active)) / len(previous_active))
                * 100,
                1,
            )
        # Weighted difficulty: weight each assessment by its submission count to avoid average-of-averages
        difficulty_weighted_sum = sum(
            (row.difficulty_score or 0) * max(1, int((row.submission_rate or 0) * 10))
            for row in assessments_by_course.get(course_id, [])
            if row.difficulty_score is not None
        )
        difficulty_weight_total = sum(
            max(1, int((row.submission_rate or 0) * 10))
            for row in assessments_by_course.get(course_id, [])
            if row.difficulty_score is not None
        )
        assessment_difficulty_score = (
            round(difficulty_weighted_sum / difficulty_weight_total, 1)
            if difficulty_weight_total
            else None
        )

        top_alert = None
        if ungraded_submissions >= 10:
            top_alert = AlertItem(
                id=f"grading-backlog-{course_id}",
                type="grading_backlog",
                severity="warning" if ungraded_submissions < 25 else "critical",
                title="Очередь проверки требует внимания",
                body=f"{ungraded_submissions} отправок все еще ожидают проверки.",
                course_id=course_id,
            )
        elif engagement_delta_pct is not None and engagement_delta_pct < -15:
            top_alert = AlertItem(
                id=f"engagement-drop-{course_id}",
                type="engagement_drop",
                severity="warning",
                title="Вовлеченность снизилась",
                body=f"Количество активных учащихся снизилось на {abs(engagement_delta_pct)}% по сравнению с предыдущим периодом.",
                course_id=course_id,
            )
        elif days_since_update is not None and days_since_update > 21:
            top_alert = AlertItem(
                id=f"stale-content-{course_id}",
                type="content_stale",
                severity="info" if days_since_update <= 35 else "warning",
                title="Контент может быть устаревшим",
                body=f"Этот курс не обновлялся уже {days_since_update} дн.",
                course_id=course_id,
            )

        rows.append(
            TeacherCourseRow(
                course_id=course_id,
                course_uuid=course.course_uuid,
                course_name=course.name,
                active_learners_7d=len(
                    current_active
                    if filters.window == "7d"
                    else {
                        event.user_id
                        for event in events
                        if event.course_id == course_id
                        and event.ts >= now - timedelta(days=7)
                    }
                ),
                completion_rate=completion_rate,
                engagement_delta_pct=engagement_delta_pct,
                at_risk_learners=at_risk_count,
                ungraded_submissions=ungraded_submissions,
                content_health_score=content_health_score,
                assessment_difficulty_score=assessment_difficulty_score,
                last_content_update_at=to_iso(last_update),
                top_alert=top_alert,
            )
        )
    sort_by = filters.sort_by or "pressure"
    if rows:
        average_completion = round(
            sum(row.completion_rate for row in rows) / len(rows), 1
        )
        completion_values = sorted(row.completion_rate for row in rows)
        median_completion = completion_values[len(completion_values) // 2]
        rows = [
            row.model_copy(
                update={
                    "teacher_completion_delta_pct": round(
                        row.completion_rate - average_completion, 1
                    ),
                    "platform_completion_delta_pct": round(
                        row.completion_rate - median_completion, 1
                    ),
                    "historical_completion_delta_pct": round(
                        row.completion_rate
                        - previous_completion.get(row.course_id, row.completion_rate),
                        1,
                    )
                    if row.course_id in previous_completion
                    else None,
                    "cohort_completion_delta_pct": round(
                        row.completion_rate
                        - all_completion_by_course.get(
                            row.course_id, row.completion_rate
                        ),
                        1,
                    )
                    if filters.cohort_ids
                    else None,
                }
            )
            for row in rows
        ]
    reverse = filters.sort_order != "asc"
    sort_map = {
        "name": lambda row: row.course_name.lower(),
        "active": lambda row: row.active_learners_7d,
        "completion": lambda row: row.completion_rate,
        "risk": lambda row: row.at_risk_learners,
        "health": lambda row: row.content_health_score,
        "engagement": lambda row: (
            row.engagement_delta_pct
            if row.engagement_delta_pct is not None
            else -10_000
        ),
        "pressure": lambda row: (
            row.top_alert is not None,
            row.at_risk_learners,
            -row.content_health_score,
        ),
        "difficulty": lambda row: (
            row.assessment_difficulty_score
            if row.assessment_difficulty_score is not None
            else -1
        ),
        "signals": lambda row: row.top_alert is not None,
    }
    rows.sort(key=sort_map.get(sort_by, sort_map["pressure"]), reverse=reverse)
    return to_iso(context.generated_at) or "", rows


def get_teacher_course_list(
    db_session: Session, scope: TeacherAnalyticsScope, filters: AnalyticsFilters
) -> TeacherCourseListResponse:
    rollup_rows = _build_rollup_course_rows(scope, filters, db_session)
    if rollup_rows is not None:
        generated_at, rows = rollup_rows
        paged_rows = rows[filters.offset : filters.offset + filters.page_size]
        course_map = {
            course.id: course
            for course in db_session.exec(
                select(Course).where(Course.id.in_(scope.course_ids))
            ).all()
        }
        usergroups = list(db_session.exec(select(UserGroup)).all())
        return TeacherCourseListResponse(
            generated_at=generated_at,
            total=len(rows),
            page=filters.page,
            page_size=filters.page_size,
            items=paged_rows,
            course_options=[
                AnalyticsFilterOption(label=course.name, value=str(course_id))
                for course_id, course in sorted(
                    course_map.items(), key=lambda item: item[1].name.lower()
                )
            ],
            cohort_options=[
                AnalyticsFilterOption(label=group.name, value=str(group.id))
                for group in sorted(usergroups, key=lambda item: item.name.lower())
            ],
        )
    # Bound the context load to the previous-period start so assessment data
    # older than the comparison window is not loaded into memory.
    previous_start, _ = filters.previous_window_bounds()
    context = load_analytics_context(
        db_session, scope.course_ids, activity_start=previous_start
    )
    generated_at, rows = build_course_rows(scope, filters, db_session, context=context)
    paged_rows = rows[filters.offset : filters.offset + filters.page_size]
    return TeacherCourseListResponse(
        generated_at=generated_at,
        total=len(rows),
        page=filters.page,
        page_size=filters.page_size,
        items=paged_rows,
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


def get_teacher_course_detail(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    course_id: int,
    filters: AnalyticsFilters,
) -> TeacherCourseDetailResponse:
    ensure_course_in_scope(scope, course_id)
    # Load only the single requested course instead of the full teacher scope.
    # This cuts context-load cost proportionally to the number of courses the teacher manages.
    context = load_analytics_context(db_session, [course_id])
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    course = context.courses_by_id.get(course_id)
    if course is None:
        msg = f"Course not found: {course_id}"
        raise ValueError(msg)

    snapshots = progress_snapshots(context, allowed_user_ids)
    course_snapshots = [
        snapshot for key, snapshot in snapshots.items() if key[0] == course_id
    ]
    risk_rows = [
        row
        for row in enrich_risk_rows(
            db_session,
            scope,
            build_risk_rows(context, filters),
            generated_date=context.generated_at.date(),
        )
        if row.course_id == course_id
    ]
    assessment_rows = [
        row
        for row in build_assessment_rows(context, filters)
        if row.course_id == course_id
    ]
    events = [
        event
        for event in build_activity_events(context, allowed_user_ids)
        if event.course_id == course_id
    ]

    current_start, current_end = filters.window_bounds(now=context.generated_at)
    engagement_series = [
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
    ]

    enrolled = len(course_snapshots)
    completion_rate = (
        safe_pct(
            sum(1 for snapshot in course_snapshots if snapshot.is_completed), enrolled
        )
        or 0.0
    )
    avg_progress = (
        round(sum(snapshot.progress_pct for snapshot in course_snapshots) / enrolled, 1)
        if enrolled
        else 0.0
    )
    active_learners_7d = len({
        event.user_id
        for event in events
        if event.ts >= context.generated_at - timedelta(days=7)
    })
    certificates_issued = sum(
        1
        for certificate, certification in context.certificates
        if certification.course_id == course_id
    )
    ungraded_submissions = sum(
        1
        for submission, assignment in context.assignment_submissions
        if assignment.course_id == course_id
        and assignment_is_reviewable(submission)
        and (allowed_user_ids is None or submission.user_id in allowed_user_ids)
    )

    ordered_steps = []
    chapter_order = {
        item.id: item.order
        for item in context.course_chapters
        if item.course_id == course_id
    }
    for chapter_activity in context.chapter_activities:
        if chapter_activity.course_id != course_id:
            continue
        activity = context.activities_by_id.get(chapter_activity.id)
        if activity is None:
            continue
        ordered_steps.append((
            chapter_order.get(chapter_activity.chapter_id, 0),
            chapter_activity.order,
            chapter_activity,
            activity,
        ))
    ordered_steps.sort(key=lambda item: (item[0], item[1]))

    completion_by_activity: dict[int, set[int]] = defaultdict(set)
    for progress in context.activity_progress:
        if allowed_user_ids is not None and progress.user_id not in allowed_user_ids:
            continue
        if progress.course_id == course_id and _activity_progress_completed(progress):
            completion_by_activity[progress.activity_id].add(progress.user_id)

    activity_dropoff: list[ActivityDropoffRow] = []
    previous_count: int | None = None
    for _chapter_order, _activity_order, chapter_activity, activity in ordered_steps:
        current_count = len(completion_by_activity.get(activity.id, set()))
        if previous_count is None:
            previous_count = current_count
            continue
        dropoff_pct = (
            round(((previous_count - current_count) / previous_count) * 100, 1)
            if previous_count
            else 0.0
        )
        activity_dropoff.append(
            ActivityDropoffRow(
                chapter_id=chapter_activity.chapter_id,
                activity_id=activity.id,
                activity_name=activity.name,
                activity_type=activity.activity_type.value,
                previous_step_completions=previous_count,
                current_step_completions=current_count,
                dropoff_pct=dropoff_pct,
            )
        )
        previous_count = current_count

    course_completion_funnel = [
        FunnelStep(label="Зачислены", count=enrolled, pct_of_previous=None),
        FunnelStep(
            label="Активны за 7 дней",
            count=active_learners_7d,
            pct_of_previous=safe_pct(active_learners_7d, enrolled),
        ),
        FunnelStep(
            label="Завершили",
            count=sum(1 for snapshot in course_snapshots if snapshot.is_completed),
            pct_of_previous=safe_pct(
                sum(1 for snapshot in course_snapshots if snapshot.is_completed),
                active_learners_7d or enrolled,
            ),
        ),
    ]
    chapter_funnel = []
    previous_chapter_count = None
    chapter_counts: dict[int, set[int]] = defaultdict(set)
    activity_chapter = {
        item.id: item.chapter_id
        for item in context.chapter_activities
        if item.course_id == course_id
    }
    for progress in context.activity_progress:
        if allowed_user_ids is not None and progress.user_id not in allowed_user_ids:
            continue
        if progress.course_id != course_id or not _activity_progress_completed(
            progress
        ):
            continue
        chapter_id = activity_chapter.get(progress.activity_id)
        if chapter_id is not None:
            chapter_counts[chapter_id].add(progress.user_id)
    for chapter_id, _order in sorted(chapter_order.items(), key=lambda item: item[1]):
        chapter = context.chapters_by_id.get(chapter_id)
        count = len(chapter_counts.get(chapter_id, set()))
        pct = (
            safe_pct(count, previous_chapter_count) if previous_chapter_count else None
        )
        chapter_funnel.append(
            FunnelStep(
                label=chapter.name if chapter else f"Глава {chapter_id}",
                count=count,
                pct_of_previous=pct,
            )
        )
        previous_chapter_count = count

    last_update = course_last_content_update(context, course_id)
    days_since_update = (
        (context.generated_at - last_update).days if last_update is not None else None
    )
    content_health = [
        ContentHealthRow(
            course_id=course_id,
            signal="content_freshness",
            severity="critical"
            if days_since_update is not None and days_since_update > 45
            else "warning"
            if days_since_update is not None and days_since_update > 21
            else "info",
            value=float(days_since_update) if days_since_update is not None else None,
            note="Количество дней с последнего обновления курса или одного из его заданий.",
        ),
        ContentHealthRow(
            course_id=course_id,
            signal="average_progress",
            severity="warning" if avg_progress < 55 else "info",
            value=avg_progress,
            note="Средний прогресс среди учащихся, попавших в текущий охват.",
        ),
        ContentHealthRow(
            course_id=course_id,
            signal="grading_backlog",
            severity="critical"
            if ungraded_submissions > 25
            else "warning"
            if ungraded_submissions > 0
            else "info",
            value=float(ungraded_submissions),
            note="Непроверенные отправки заданий, которые сейчас задерживают обратную связь.",
        ),
    ]

    return TeacherCourseDetailResponse(
        generated_at=to_iso(context.generated_at) or "",
        course={
            "id": course_id,
            "course_uuid": course.course_uuid,
            "name": course.name,
        },
        summary=TeacherCourseDetailSummary(
            enrolled_learners=enrolled,
            active_learners_7d=active_learners_7d,
            completion_rate=completion_rate,
            avg_progress_pct=avg_progress,
            at_risk_learners=sum(
                1 for row in risk_rows if row.risk_level in {"medium", "high"}
            ),
            ungraded_submissions=ungraded_submissions,
            certificates_issued=certificates_issued,
        ),
        funnels={
            "course_completion": course_completion_funnel,
            "chapter_dropoff": chapter_funnel,
        },
        engagement_trend=engagement_series,
        activity_dropoff=activity_dropoff,
        at_risk_learners=risk_rows[:20],
        assessment_outliers=assessment_rows[:12],
        content_health=content_health,
        content_bottlenecks=build_content_bottlenecks(
            context, filters, course_id=course_id, limit=12
        ),
    )
