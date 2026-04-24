from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import delete, distinct, func, select
from sqlmodel import Session

from src.db.analytics import (
    DailyAssessmentMetrics,
    DailyCourseEngagement,
    DailyCourseMetrics,
    DailyTeacherMetrics,
    DailyUserCourseProgress,
    LearnerRiskSnapshot,
)
from src.db.courses.courses import Course
from src.db.resource_authors import ResourceAuthor, ResourceAuthorshipStatusEnum
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    build_activity_events,
    load_analytics_context,
    progress_snapshots,
    safe_pct,
)
from src.services.analytics.scope import TeacherAnalyticsScope

logger = logging.getLogger(__name__)


def supports_rollup_reads(filters: AnalyticsFilters) -> bool:
    return (
        not filters.cohort_ids
        and filters.bucket_start is None
        and filters.window in {"7d", "28d", "90d"}
        and filters.compare == "previous_period"
    )


def _unwrap_scalar_date(value: Any) -> date | None:
    if value is None or isinstance(value, date):
        return value
    if isinstance(value, (tuple, list)):
        return _unwrap_scalar_date(value[0] if value else None)
    mapping = getattr(value, "_mapping", None)
    if isinstance(mapping, Mapping):
        first_value = next(iter(mapping.values()), None)
        return _unwrap_scalar_date(first_value)
    return None


def _latest_metric_date(
    db_session: Session, model: type, date_column: object
) -> date | None:
    value = db_session.exec(select(func.max(date_column))).one_or_none()
    return _unwrap_scalar_date(value)


def get_latest_teacher_rollup(
    db_session: Session,
    *,
    teacher_user_id: int,
) -> DailyTeacherMetrics | None:
    metric_date = _latest_metric_date(
        db_session, DailyTeacherMetrics, DailyTeacherMetrics.metric_date
    )
    if metric_date is None:
        return None
    return db_session.exec(
        select(DailyTeacherMetrics).where(
            DailyTeacherMetrics.metric_date == metric_date,
            DailyTeacherMetrics.teacher_user_id == teacher_user_id,
        )
    ).first()


def list_latest_course_rollups(
    db_session: Session,
    *,
    course_ids: list[int],
    teacher_user_id: int | None = None,
) -> list[DailyCourseMetrics]:
    metric_date = _latest_metric_date(
        db_session, DailyCourseMetrics, DailyCourseMetrics.metric_date
    )
    if metric_date is None or not course_ids:
        return []
    statement = select(DailyCourseMetrics).where(
        DailyCourseMetrics.metric_date == metric_date,
        DailyCourseMetrics.course_id.in_(course_ids),
    )
    if teacher_user_id not in (None, 0):
        statement = statement.where(
            DailyCourseMetrics.teacher_user_id == teacher_user_id
        )
    return list(db_session.exec(statement).all())


def list_latest_assessment_rollups(
    db_session: Session,
    *,
    course_ids: list[int],
) -> list[DailyAssessmentMetrics]:
    metric_date = _latest_metric_date(
        db_session, DailyAssessmentMetrics, DailyAssessmentMetrics.metric_date
    )
    if metric_date is None or not course_ids:
        return []
    return list(
        db_session.exec(
            select(DailyAssessmentMetrics).where(
                DailyAssessmentMetrics.metric_date == metric_date,
                DailyAssessmentMetrics.course_id.in_(course_ids),
            )
        ).all()
    )


def freshness_seconds_from_rollup(generated_at: datetime | None) -> int:
    if generated_at is None:
        return 0
    normalized = (
        generated_at if generated_at.tzinfo else generated_at.replace(tzinfo=UTC)
    )
    return max(
        0, int((datetime.now(tz=UTC) - normalized.astimezone(UTC)).total_seconds())
    )


def _merge_teacher_metrics(
    db_session: Session,
    *,
    target_date: date,
    teacher_user_id: int,
    teacher_course_ids: set[int],
    teacher_events: list,
    teacher_snapshots: list,
    teacher_risk_rows: list,
    course_rows: list,
    context,
    current_start: datetime,
    previous_start: datetime,
    previous_end: datetime,
) -> None:
    current_active = {
        event.user_id for event in teacher_events if event.ts >= current_start
    }
    previous_active = {
        event.user_id
        for event in teacher_events
        if previous_start <= event.ts < previous_end
    }
    db_session.merge(
        DailyTeacherMetrics(
            metric_date=target_date,
            teacher_user_id=teacher_user_id,
            managed_course_count=len(teacher_course_ids),
            active_learners_7d=len({
                event.user_id
                for event in teacher_events
                if (context.generated_at - event.ts).days <= 7
            }),
            active_learners_28d=len(current_active),
            active_learners_90d=len({
                event.user_id
                for event in teacher_events
                if (context.generated_at - event.ts).days <= 90
            }),
            returning_learners_28d=len(current_active & previous_active),
            completion_rate=safe_pct(
                sum(1 for snapshot in teacher_snapshots if snapshot.is_completed),
                len(teacher_snapshots),
            ),
            avg_progress_pct=round(
                sum(snapshot.progress_pct for snapshot in teacher_snapshots)
                / max(1, len(teacher_snapshots)),
                2,
            ),
            at_risk_learners=sum(
                1 for row in teacher_risk_rows if row.risk_level in {"medium", "high"}
            ),
            ungraded_submissions=sum(row.ungraded_submissions for row in course_rows),
            courses_with_negative_engagement=sum(
                1
                for row in course_rows
                if row.engagement_delta_pct is not None and row.engagement_delta_pct < 0
            ),
            certificates_issued_28d=sum(
                1
                for _certificate, certification in context.certificates
                if certification.course_id in teacher_course_ids
            ),
            generated_at=context.generated_at,
        )
    )


def refresh_teacher_analytics_rollups(
    db_session: Session, *, snapshot_date: date | None = None
) -> dict[str, object]:
    from src.services.analytics.assessments import (
        build_assessment_rows,
        get_teacher_assessment_detail,
    )
    from src.services.analytics.courses import build_course_rows
    from src.services.analytics.risk import build_risk_rows

    target_date = snapshot_date or date.today()
    filters = AnalyticsFilters(
        window="28d", compare="previous_period", bucket="day", timezone="UTC"
    )

    refreshed_courses: list[dict[str, object]] = []

    logger.info(
        "Refreshing teacher analytics rollups",
        extra={
            "snapshot_date": target_date.isoformat(),
        },
    )

    course_ids = list(db_session.exec(select(Course.id)).all())
    if course_ids:
        scope = TeacherAnalyticsScope(
            teacher_user_id=0,
            course_ids=course_ids,
            cohort_ids=[],
            has_platform_scope=True,
        )
        # Bound the context load to the previous-period start (2× the window) so the nightly
        # rollup refresh does not repeatedly scan unbounded historical data (issue 12).
        preliminary_previous_start, _ = filters.previous_window_bounds(
            now=datetime.now(tz=UTC)
        )
        context = load_analytics_context(
            db_session, course_ids, activity_start=preliminary_previous_start
        )
        course_rows = build_course_rows(scope, filters, db_session, context=context)[1]
        assessment_rows = build_assessment_rows(context, filters)
        risk_rows = build_risk_rows(context, filters)
        snapshots = progress_snapshots(context)
        events = build_activity_events(context)
        current_start, _current_end = filters.window_bounds(now=context.generated_at)
        previous_start, previous_end = filters.previous_window_bounds(
            now=context.generated_at
        )

        db_session.exec(
            delete(DailyTeacherMetrics).where(
                DailyTeacherMetrics.metric_date == target_date,
            )
        )
        db_session.exec(
            delete(DailyCourseMetrics).where(
                DailyCourseMetrics.metric_date == target_date,
            )
        )
        db_session.exec(
            delete(DailyCourseEngagement).where(
                DailyCourseEngagement.metric_date == target_date,
            )
        )
        db_session.exec(
            delete(DailyAssessmentMetrics).where(
                DailyAssessmentMetrics.metric_date == target_date,
            )
        )
        db_session.exec(
            delete(DailyUserCourseProgress).where(
                DailyUserCourseProgress.metric_date == target_date,
            )
        )
        db_session.exec(
            delete(LearnerRiskSnapshot).where(
                LearnerRiskSnapshot.snapshot_date == target_date,
            )
        )

        for snapshot in snapshots.values():
            db_session.merge(
                DailyUserCourseProgress(
                    metric_date=target_date,
                    course_id=snapshot.course_id,
                    user_id=snapshot.user_id,
                    trailrun_id=snapshot.trailrun_id,
                    progress_pct=snapshot.progress_pct,
                    completed_steps=snapshot.completed_steps,
                    total_steps=snapshot.total_steps,
                    last_activity_at=snapshot.last_activity_at,
                    is_completed=snapshot.is_completed,
                    has_certificate=snapshot.has_certificate,
                    generated_at=context.generated_at,
                )
            )

        for row in risk_rows:
            db_session.merge(
                LearnerRiskSnapshot(
                    snapshot_date=target_date,
                    course_id=row.course_id,
                    teacher_user_id=context.courses_by_id[row.course_id].creator_id,
                    user_id=row.user_id,
                    progress_pct=row.progress_pct,
                    days_since_last_activity=row.days_since_last_activity,
                    failed_assessments=row.failed_assessments,
                    missing_required_assessments=row.missing_required_assessments,
                    open_grading_blocks=row.open_grading_blocks,
                    risk_score=row.risk_score,
                    risk_level=row.risk_level,
                    reason_codes=row.reason_codes,
                    recommended_action=row.recommended_action,
                    generated_at=context.generated_at,
                )
            )

        for row in course_rows:
            course_snapshots = [
                snapshot
                for snapshot in snapshots.values()
                if snapshot.course_id == row.course_id
            ]
            db_session.merge(
                DailyCourseMetrics(
                    metric_date=target_date,
                    course_id=row.course_id,
                    teacher_user_id=context.courses_by_id[row.course_id].creator_id,
                    enrolled_learners=len(course_snapshots),
                    active_learners_7d=row.active_learners_7d,
                    active_learners_28d=len({
                        event.user_id
                        for event in events
                        if event.course_id == row.course_id
                    }),
                    completion_rate=row.completion_rate,
                    avg_progress_pct=round(
                        sum(snapshot.progress_pct for snapshot in course_snapshots)
                        / max(1, len(course_snapshots)),
                        2,
                    ),
                    at_risk_learners=row.at_risk_learners,
                    ungraded_submissions=row.ungraded_submissions,
                    certificates_issued=sum(
                        1
                        for certificate, certification in context.certificates
                        if certification.course_id == row.course_id
                    ),
                    content_health_score=row.content_health_score,
                    engagement_delta_pct=row.engagement_delta_pct,
                    last_content_update_at=context.courses_by_id[
                        row.course_id
                    ].update_date,
                    generated_at=context.generated_at,
                )
            )

        # Build course_id → all author user_ids (creator + active co-authors)
        uuid_to_course_id = {
            c.course_uuid: c.id for c in context.courses_by_id.values() if c.course_uuid
        }
        co_author_rows = db_session.exec(
            select(ResourceAuthor).where(
                ResourceAuthor.resource_uuid.in_(list(uuid_to_course_id.keys())),
                ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
            )
        ).all()
        course_author_ids: dict[int, set[int]] = {}
        for c in context.courses_by_id.values():
            if c.creator_id is not None:
                course_author_ids.setdefault(c.id, set()).add(c.creator_id)
        for ra in co_author_rows:
            cid = uuid_to_course_id.get(ra.resource_uuid)
            if cid is not None:
                course_author_ids.setdefault(cid, set()).add(ra.user_id)

        teacher_course_rows: dict[int, list] = {}
        for row in course_rows:
            for author_id in course_author_ids.get(row.course_id, set()):
                teacher_course_rows.setdefault(author_id, []).append(row)

        for teacher_id, rows in teacher_course_rows.items():
            teacher_course_ids = {row.course_id for row in rows}
            teacher_events = [
                event for event in events if event.course_id in teacher_course_ids
            ]
            teacher_snapshots = [
                snapshot
                for snapshot in snapshots.values()
                if snapshot.course_id in teacher_course_ids
            ]
            teacher_risk_rows = [
                row for row in risk_rows if row.course_id in teacher_course_ids
            ]
            _merge_teacher_metrics(
                db_session,
                target_date=target_date,
                teacher_user_id=teacher_id,
                teacher_course_ids=teacher_course_ids,
                teacher_events=teacher_events,
                teacher_snapshots=teacher_snapshots,
                teacher_risk_rows=teacher_risk_rows,
                course_rows=rows,
                context=context,
                current_start=current_start,
                previous_start=previous_start,
                previous_end=previous_end,
            )

        _merge_teacher_metrics(
            db_session,
            target_date=target_date,
            teacher_user_id=0,
            teacher_course_ids=set(course_ids),
            teacher_events=events,
            teacher_snapshots=list(snapshots.values()),
            teacher_risk_rows=risk_rows,
            course_rows=course_rows,
            context=context,
            current_start=current_start,
            previous_start=previous_start,
            previous_end=previous_end,
        )

        step_order = {
            (item.course_id, item.id): item.order
            for item in context.chapter_activities
            if item.course_id in course_ids
        }
        for course_id in course_ids:
            activity_events = [
                event
                for event in events
                if event.course_id == course_id and event.activity_id is not None
            ]
            activity_users: dict[int, set[int]] = {}
            for event in activity_events:
                if event.activity_id is None:
                    continue
                activity_users.setdefault(event.activity_id, set()).add(event.user_id)
            completed_users: dict[int, set[int]] = {}
            ordered_activity_ids = [
                item.id
                for item in sorted(
                    (
                        item
                        for item in context.chapter_activities
                        if item.course_id == course_id
                    ),
                    key=lambda item: (item.chapter_id, item.order),
                )
            ]
            for step in context.trail_steps:
                if step.course_id == course_id and step.complete:
                    completed_users.setdefault(step.activity_id, set()).add(
                        step.user_id
                    )
            previous_completed_count: int | None = None
            for activity_id in ordered_activity_ids:
                started = activity_users.get(activity_id, set())
                completed = completed_users.get(activity_id, set())
                dropoff_pct = None
                if previous_completed_count not in (None, 0):
                    dropoff_pct = round(
                        (
                            (previous_completed_count - len(completed))
                            / previous_completed_count
                        )
                        * 100,
                        2,
                    )
                previous_completed_count = len(completed)
                db_session.merge(
                    DailyCourseEngagement(
                        metric_date=target_date,
                        course_id=course_id,
                        chapter_id=next(
                            (
                                item.chapter_id
                                for item in context.chapter_activities
                                if item.id == activity_id
                                and item.course_id == course_id
                            ),
                            None,
                        ),
                        activity_id=activity_id,
                        step_order=step_order.get((course_id, activity_id)),
                        started_learners=len(started),
                        completed_learners=len(completed),
                        dropoff_from_previous_pct=dropoff_pct,
                        generated_at=context.generated_at,
                    )
                )

        for row in assessment_rows:
            detail = get_teacher_assessment_detail(
                db_session, scope, row.assessment_type, row.assessment_id, filters
            )
            db_session.merge(
                DailyAssessmentMetrics(
                    metric_date=target_date,
                    course_id=row.course_id,
                    activity_id=row.activity_id,
                    assessment_type=row.assessment_type,
                    assessment_id=row.assessment_id,
                    eligible_learners=detail.summary.eligible_learners,
                    submitted_learners=detail.summary.submitted_learners,
                    submission_rate=detail.summary.submission_rate,
                    completion_rate=row.completion_rate,
                    pass_rate=detail.summary.pass_rate,
                    median_score=detail.summary.median_score,
                    avg_score=row.median_score,
                    avg_attempts=detail.summary.avg_attempts,
                    grading_latency_hours_p50=detail.summary.grading_latency_hours_p50,
                    grading_latency_hours_p90=detail.summary.grading_latency_hours_p90,
                    difficulty_score=row.difficulty_score,
                    generated_at=context.generated_at,
                )
            )

        db_session.commit()
        logger.info(
            "Refreshed teacher analytics rollups",
            extra={
                "snapshot_date": target_date.isoformat(),
                "course_rows": len(course_rows),
                "assessment_rows": len(assessment_rows),
                "risk_rows": len(risk_rows),
                "progress_rows": len(snapshots),
            },
        )
        refreshed_courses = [
            {
                "courses": len(course_rows),
                "assessments": len(assessment_rows),
                "risk_rows": len(risk_rows),
                "progress_rows": len(snapshots),
            }
        ]

    return {
        "status": "ok",
        "snapshot_date": target_date.isoformat(),
        "message": "Агрегаты аналитики преподавателя обновлены из оперативных аналитических моделей чтения.",
        "result": refreshed_courses[0] if refreshed_courses else {},
    }
