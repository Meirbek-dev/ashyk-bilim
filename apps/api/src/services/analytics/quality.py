from __future__ import annotations

from typing import Literal

from sqlalchemy import select
from sqlmodel import Session, col

from src.db.analytics import DailyTeacherMetrics
from src.infra.db.execute import sa_execute
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import AnalyticsContext, progress_snapshots, to_iso
from src.services.analytics.rollups import supports_teacher_rollup_reads
from src.services.analytics.schemas import AnalyticsDataQuality, DataQualityIssue
from src.services.analytics.scope import TeacherAnalyticsScope


def build_data_quality(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    filters: AnalyticsFilters,
    context: AnalyticsContext,
    *,
    freshness_seconds: int,
) -> AnalyticsDataQuality:
    teacher_rollup = (
        sa_execute(
            db_session,
            select(DailyTeacherMetrics)
            .where(col(DailyTeacherMetrics.teacher_user_id) == scope.teacher_user_id)
            .order_by(col(DailyTeacherMetrics.metric_date).desc())
            .limit(1),
        )
        .scalars()
        .first()
        if supports_teacher_rollup_reads(filters)
        else None
    )
    mode: Literal["live", "rollup"] = (
        "rollup" if supports_teacher_rollup_reads(filters) and teacher_rollup is not None else "live"
    )
    snapshots = progress_snapshots(context)
    missing_sources: list[str] = []
    if not context.trail_steps:
        missing_sources.append("progress_events")
    if not context.manual_assessment_submissions:
        missing_sources.append("manual_assessment_submissions")
    if not context.quiz_submissions:
        missing_sources.append("quiz_submissions")
    if not context.exam_attempts:
        missing_sources.append("exam_attempts")
    if not context.code_submissions:
        missing_sources.append("code_submissions")

    courses_without_enough_data: list[dict[str, object]] = []
    for course_id in scope.course_ids:
        course_snapshots = [snapshot for snapshot in snapshots.values() if snapshot.course_id == course_id]
        if len(course_snapshots) < 5:
            course = context.courses_by_id.get(course_id)
            courses_without_enough_data.append({
                "course_id": course_id,
                "course_name": course.name if course is not None else "Unknown course",
                "learner_count": len(course_snapshots),
                "reason": "fewer_than_5_learners",
            })

    excluded_preview_attempts = 0
    excluded_teacher_attempts = 0
    issues: list[DataQualityIssue] = []
    if missing_sources:
        issues.append(
            DataQualityIssue(
                id="missing-event-sources",
                severity="warning",
                title="Некоторые источники событий не содержат данных",
                detail=", ".join(missing_sources),
                source="events",
            )
        )
    if courses_without_enough_data:
        issues.append(
            DataQualityIssue(
                id="thin-course-data",
                severity="warning",
                title="В некоторых курсах слишком мало данных для высокодостоверных выводов",
                detail=f"В {len(courses_without_enough_data)} курсах менее 5 учащихся.",
                source="enrollment",
            )
        )
    if freshness_seconds > 86_400:
        issues.append(
            DataQualityIssue(
                id="stale-rollup",
                severity="critical",
                title="Агрегированные данные старше 24 часов",
                detail="Обновите агрегаты аналитики перед использованием этого представления для принятия оперативных решений.",
                source="rollups",
            )
        )

    confidence: Literal["low", "medium", "high"] = "high"
    if missing_sources or courses_without_enough_data:
        confidence = "medium"
    if freshness_seconds > 86_400 or len(missing_sources) >= 3:
        confidence = "low"

    return AnalyticsDataQuality(
        mode=mode,
        last_rollup_time=to_iso(teacher_rollup.generated_at) if teacher_rollup is not None else None,
        freshness_seconds=freshness_seconds,
        confidence_level=confidence,
        missing_event_sources=missing_sources,
        courses_without_enough_data=courses_without_enough_data[:20],
        excluded_preview_attempts=excluded_preview_attempts,
        excluded_teacher_attempts=excluded_teacher_attempts,
        issues=issues,
    )
