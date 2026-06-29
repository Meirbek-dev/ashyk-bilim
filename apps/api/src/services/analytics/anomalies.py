from __future__ import annotations

from collections import defaultdict

from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    AnalyticsContext,
    build_activity_events,
    course_last_content_update,
    parse_timestamp,
    percentile,
)
from src.services.analytics.schemas import (
    AnomalyItem,
    AssessmentOutlierRow,
    TeacherCourseRow,
)


def build_anomalies(
    context: AnalyticsContext,
    filters: AnalyticsFilters,
    *,
    course_rows: list[TeacherCourseRow],
    assessment_rows: list[AssessmentOutlierRow],
) -> list[AnomalyItem]:
    events = build_activity_events(context)
    current_start, current_end = filters.window_bounds(now=context.generated_at)
    previous_start, previous_end = filters.previous_window_bounds(now=context.generated_at)
    anomalies: list[AnomalyItem] = []

    for row in course_rows:
        current_active = {
            event.user_id
            for event in events
            if event.course_id == row.course_id and current_start <= event.ts <= current_end
        }
        previous_active = {
            event.user_id
            for event in events
            if event.course_id == row.course_id and previous_start <= event.ts < previous_end
        }
        if previous_active and len(current_active) <= max(1, len(previous_active) * 0.55):
            anomalies.append(
                AnomalyItem(
                    id=f"engagement-drop-{row.course_id}",
                    type="engagement_drop",
                    severity="critical" if len(current_active) <= len(previous_active) * 0.35 else "warning",
                    title=f"{row.course_name}: резкое снижение вовлеченности",
                    detail="Количество активных учащихся резко сократилось по сравнению с предыдущим периодом.",
                    observed_value=float(len(current_active)),
                    baseline_value=float(len(previous_active)),
                    course_id=row.course_id,
                    course_name=row.course_name,
                )
            )

    current_submissions: defaultdict[int, int] = defaultdict(int)
    previous_submissions: defaultdict[int, int] = defaultdict(int)
    for event in events:
        if event.source not in {"manual_assessment", "quiz", "exam", "code_challenge"}:
            continue
        if current_start <= event.ts <= current_end:
            current_submissions[event.course_id] += 1
        elif previous_start <= event.ts < previous_end:
            previous_submissions[event.course_id] += 1
    course_name_by_id = {row.course_id: row.course_name for row in course_rows}
    for course_id, current_count in current_submissions.items():
        previous_count = previous_submissions.get(course_id, 0)
        if current_count >= 10 and current_count >= max(8, previous_count * 2.5):
            anomalies.append(
                AnomalyItem(
                    id=f"submission-spike-{course_id}",
                    type="submission_spike",
                    severity="warning",
                    title=f"{course_name_by_id.get(course_id, 'Курс')}: необычный всплеск отправок",
                    detail="Объем отправок значительно выше, чем в предыдущем периоде.",
                    observed_value=float(current_count),
                    baseline_value=float(previous_count),
                    course_id=course_id,
                    course_name=course_name_by_id.get(course_id),
                )
            )

    durations_by_activity: dict[int, list[float]] = defaultdict(list)
    for submission, activity in context.quiz_submissions:
        metadata = submission.metadata_json
        duration_seconds: object = metadata.get("duration_seconds")
        if not isinstance(duration_seconds, int | float) and submission.started_at and submission.submitted_at:
            duration_seconds = (submission.submitted_at - submission.started_at).total_seconds()
        if not isinstance(duration_seconds, int | float):
            continue
        activity_id = activity.id
        if activity_id is not None and duration_seconds > 0:
            durations_by_activity[activity_id].append(float(duration_seconds))
    for activity_id, durations in durations_by_activity.items():
        if len(durations) < 5:
            continue
        fast_cutoff = percentile(durations, 0.1) or 0
        fast_count = sum(1 for duration in durations if duration <= max(20, fast_cutoff))
        if fast_count >= max(3, len(durations) * 0.25):
            activity_for_anomaly = context.activities_by_id.get(activity_id)
            anomaly_course_id = activity_for_anomaly.course_id if activity_for_anomaly is not None else None
            course_for_anomaly = context.courses_by_id.get(anomaly_course_id) if anomaly_course_id is not None else None
            anomalies.append(
                AnomalyItem(
                    id=f"fast-quiz-{activity_id}",
                    type="fast_quiz_completion",
                    severity="warning",
                    title=f"{activity_for_anomaly.name if activity_for_anomaly is not None else 'Тест'}: подозрительно быстрое завершение",
                    detail="Значительная часть попыток завершена за время, близкое к минимально наблюдаемому.",
                    observed_value=float(fast_count),
                    baseline_value=float(len(durations)),
                    course_id=anomaly_course_id,
                    course_name=course_for_anomaly.name if course_for_anomaly is not None else None,
                    assessment_type="quiz",
                    assessment_id=activity_id,
                    activity_id=activity_id,
                )
            )

    for assessment in assessment_rows:
        last_update = course_last_content_update(context, assessment.course_id)
        if last_update is None or assessment.median_score is None:
            continue
        before_scores: list[float] = []
        after_scores: list[float] = []
        for submission, activity in context.quiz_submissions:
            if activity.id != assessment.activity_id:
                continue
            completed_at = parse_timestamp(submission.submitted_at) or parse_timestamp(submission.started_at)
            if completed_at is None:
                continue
            score = submission.final_score if submission.final_score is not None else submission.auto_score
            if score is None:
                continue
            if completed_at < last_update:
                before_scores.append(float(score))
            else:
                after_scores.append(float(score))
        if len(before_scores) >= 3 and len(after_scores) >= 3:
            before_avg = sum(before_scores) / len(before_scores)
            after_avg = sum(after_scores) / len(after_scores)
            if abs(after_avg - before_avg) >= 20:
                anomalies.append(
                    AnomalyItem(
                        id=f"score-shift-{assessment.assessment_type}-{assessment.assessment_id}",
                        type="score_distribution_shift",
                        severity="warning",
                        title=f"{assessment.title}: распределение баллов изменилось после обновления контента",
                        detail="Средний балл существенно изменился после последнего обновления контента.",
                        observed_value=round(after_avg, 1),
                        baseline_value=round(before_avg, 1),
                        course_id=assessment.course_id,
                        course_name=assessment.course_name,
                        assessment_type=assessment.assessment_type,
                        assessment_id=assessment.assessment_id,
                        activity_id=assessment.activity_id,
                    )
                )

    severity_score = {"critical": 2, "warning": 1, "info": 0}
    anomalies.sort(
        key=lambda item: (severity_score[item.severity], item.observed_value or 0),
        reverse=True,
    )
    return anomalies[:12]
