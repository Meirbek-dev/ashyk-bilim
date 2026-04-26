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
                    title=f"{row.course_name}: sudden engagement drop",
                    detail="Active learners fell sharply against the previous period.",
                    observed_value=float(len(current_active)),
                    baseline_value=float(len(previous_active)),
                    course_id=row.course_id,
                    course_name=row.course_name,
                )
            )

    current_submissions = defaultdict(int)
    previous_submissions = defaultdict(int)
    for event in events:
        if event.source not in {"assignment", "quiz", "exam", "code_challenge"}:
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
                    title=f"{course_name_by_id.get(course_id, 'Course')}: unusual submission spike",
                    detail="Submission volume is much higher than the previous period.",
                    observed_value=float(current_count),
                    baseline_value=float(previous_count),
                    course_id=course_id,
                    course_name=course_name_by_id.get(course_id),
                )
            )

    durations_by_activity: dict[int, list[float]] = defaultdict(list)
    for attempt, activity in context.quiz_attempts:
        if attempt.duration_seconds is not None and attempt.duration_seconds > 0:
            durations_by_activity[activity.id].append(float(attempt.duration_seconds))
    for activity_id, durations in durations_by_activity.items():
        if len(durations) < 5:
            continue
        fast_cutoff = percentile(durations, 0.1) or 0
        fast_count = sum(1 for duration in durations if duration <= max(20, fast_cutoff))
        if fast_count >= max(3, len(durations) * 0.25):
            activity = context.activities_by_id.get(activity_id)
            anomalies.append(
                AnomalyItem(
                    id=f"fast-quiz-{activity_id}",
                    type="fast_quiz_completion",
                    severity="warning",
                    title=f"{activity.name if activity else 'Quiz'}: suspiciously fast completions",
                    detail="A meaningful share of attempts finished near the fastest observed duration.",
                    observed_value=float(fast_count),
                    baseline_value=float(len(durations)),
                    course_id=activity.course_id if activity is not None else None,
                    course_name=context.courses_by_id.get(activity.course_id).name
                    if activity is not None and activity.course_id in context.courses_by_id
                    else None,
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
        for attempt, activity in context.quiz_attempts:
            if activity.id != assessment.activity_id:
                continue
            completed_at = parse_timestamp(attempt.end_ts) or parse_timestamp(attempt.start_ts)
            if completed_at is None:
                continue
            score = (attempt.score / attempt.max_score) * 100 if attempt.max_score else attempt.score
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
                        title=f"{assessment.title}: score distribution shifted after content update",
                        detail="Average score changed materially after the most recent content update.",
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
