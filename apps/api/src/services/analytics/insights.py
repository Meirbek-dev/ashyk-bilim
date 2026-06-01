from __future__ import annotations

from src.services.analytics.schemas import (
    AssessmentOutlierRow,
    AtRiskLearnerRow,
    ContentBottleneckRow,
    InsightFeedItem,
    TeacherCourseRow,
    TeacherWorkloadSummary,
)


def build_insight_feed(
    *,
    risk_rows: list[AtRiskLearnerRow],
    course_rows: list[TeacherCourseRow],
    assessment_rows: list[AssessmentOutlierRow],
    bottlenecks: list[ContentBottleneckRow],
    workload: TeacherWorkloadSummary,
    limit: int = 10,
) -> list[InsightFeedItem]:
    items: list[InsightFeedItem] = []

    newly_at_risk_by_course: dict[int, list[AtRiskLearnerRow]] = {}
    for row in risk_rows:
        if row.risk_trend == "newly_at_risk" and row.risk_level in {"medium", "high"}:
            newly_at_risk_by_course.setdefault(row.course_id, []).append(row)
    for course_id, learners in newly_at_risk_by_course.items():
        course_name = learners[0].course_name
        items.append(
            InsightFeedItem(
                id=f"risk-new-{course_id}",
                category="risk",
                severity="critical" if len(learners) >= 10 else "warning",
                priority=95 + min(20, len(learners)),
                title=f"В курсе {course_name} появилось {len(learners)} новых учащихся в зоне риска.",
                body="Риск увеличился по сравнению с предыдущим базовым уровнем каждого учащегося; просмотрите список наблюдения перед следующим занятием.",
                course_id=course_id,
                learner_count=len(learners),
                href="/dash/analytics/learners/at-risk",
            )
        )

    for assessment_row in assessment_rows:
        if assessment_row.pass_rate is None or assessment_row.pass_rate >= 65:
            continue
        reason = (
            "диагностикой качества"
            if assessment_row.discrimination_index is not None
            else "низким уровнем прохождения"
        )
        items.append(
            InsightFeedItem(
                id=f"assessment-{assessment_row.assessment_type}-{assessment_row.assessment_id}",
                category="assessment",
                severity="critical" if assessment_row.pass_rate < 45 else "warning",
                priority=80 + int(65 - assessment_row.pass_rate),
                title=f"Уровень прохождения {assessment_row.title} составляет {assessment_row.pass_rate}%.",
                body=f"Аномалия вызвана {reason}; откройте диагностику оценивания перед повторным использованием.",
                course_id=assessment_row.course_id,
                activity_id=assessment_row.activity_id,
                assessment_type=assessment_row.assessment_type,
                assessment_id=assessment_row.assessment_id,
                href=f"/dash/analytics/assessments/{assessment_row.assessment_type}/{assessment_row.assessment_id}",
            )
        )

    items.extend(
        InsightFeedItem(
            id=f"content-{bottleneck.signal}-{bottleneck.activity_id}",
            category="content",
            severity=bottleneck.severity,
            priority=70 + (20 if bottleneck.severity == "critical" else 10) + min(10, bottleneck.exit_count),
            title=f"{bottleneck.activity_name} является узким местом контента.",
            body=bottleneck.note,
            course_id=bottleneck.course_id,
            activity_id=bottleneck.activity_id,
            learner_count=bottleneck.started_learners,
            href=f"/dash/analytics/courses?course_ids={bottleneck.course_id}",
        )
        for bottleneck in bottlenecks[:4]
    )

    if workload.backlog_total:
        items.append(
            InsightFeedItem(
                id="workload-backlog",
                category="workload",
                severity="critical" if workload.sla_breaches else "warning",
                priority=85 + min(25, workload.sla_breaches),
                title=f"{workload.backlog_total} отправок ожидают проверки.",
                body=f"{workload.sla_breaches} нарушили 72-часовой регламент проверки; прогноз через 7 дней — {workload.forecast_backlog_7d}.",
                href="/dash/analytics?drill=backlog",
            )
        )

    improved_courses = [
        row
        for row in course_rows
        if row.historical_completion_delta_pct is not None and row.historical_completion_delta_pct >= 10
    ]
    items.extend(
        InsightFeedItem(
            id=f"completion-improved-{row.course_id}",
            category="completion",
            severity="info",
            priority=45 + int(row.historical_completion_delta_pct or 0),
            title=f"Завершаемость курса {row.course_name} улучшилась на {row.historical_completion_delta_pct} п.п.",
            body="Эта когорта превосходит исторический базовый уровень курса.",
            course_id=row.course_id,
            href=f"/dash/analytics/courses/{row.course_uuid}",
        )
        for row in improved_courses[:3]
    )

    severity_score = {"critical": 2, "warning": 1, "info": 0}
    items.sort(key=lambda item: (item.priority, severity_score[item.severity]), reverse=True)
    return items[:limit]
