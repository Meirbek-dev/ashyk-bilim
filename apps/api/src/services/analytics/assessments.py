from __future__ import annotations

import operator
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlmodel import Session

from src.db.assessments import Assessment
from src.db.courses.activities import Activity, ActivityTypeEnum
from src.db.courses.courses import Course
from src.db.usergroups import UserGroup
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    AnalyticsContext,
    assessment_pass_threshold,
    assignment_graded_at,
    assignment_is_graded,
    assignment_is_reviewable,
    assignment_score,
    assignment_submission_status,
    assignment_submitted_at,
    cohort_user_ids,
    display_name,
    hours_between,
    load_analytics_context,
    median_or_none,
    parse_timestamp,
    percentile,
    progress_snapshots,
    safe_pct,
    to_iso,
)
from src.services.analytics.queries import (
    bucket_start as normalize_bucket_start,
)
from src.services.analytics.rollups import (
    list_latest_assessment_rollups,
    supports_rollup_reads,
)
from src.services.analytics.schemas import (
    AnalyticsFilterOption,
    AssessmentLearnerRow,
    AssessmentOutlierRow,
    CommonFailureRow,
    HistogramBucket,
    QuestionDifficultyRow,
    TeacherAssessmentDetailResponse,
    TeacherAssessmentDetailSummary,
    TeacherAssessmentListResponse,
)
from src.services.analytics.scope import TeacherAnalyticsScope


def _selected_bucket_window(
    filters: AnalyticsFilters | None,
) -> tuple[datetime, datetime] | None:
    if filters is None or filters.bucket_start is None:
        return None
    selected = filters.bucket_start
    if selected.tzinfo is None:
        selected = selected.replace(tzinfo=UTC)
    local_start = normalize_bucket_start(selected, filters.bucket, filters.tzinfo)
    local_end = local_start + (
        timedelta(weeks=1) if filters.bucket == "week" else timedelta(days=1)
    )
    return local_start.astimezone(UTC), local_end.astimezone(UTC)


def _in_bucket_window(
    value: object, bucket_window: tuple[datetime, datetime] | None
) -> bool:
    if bucket_window is None:
        return True
    timestamp = parse_timestamp(value)
    if timestamp is None:
        return False
    start, end = bucket_window
    return start <= timestamp < end


def _build_rollup_assessment_rows(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    filters: AnalyticsFilters,
) -> tuple[str, list[AssessmentOutlierRow]] | None:
    if not supports_rollup_reads(filters):
        return None
    rollups = list_latest_assessment_rollups(db_session, course_ids=scope.course_ids)
    if not rollups:
        return None

    course_map = {
        course.id: course
        for course in db_session.exec(
            select(Course).where(
                Course.id.in_(list({row.course_id for row in rollups}))
            )
        ).all()
    }
    assessments = {
        assessment.id: assessment
        for assessment in db_session.exec(
            select(Assessment).where(
                Assessment.id.in_(
                    list({
                        row.assessment_id
                        for row in rollups
                        if row.assessment_type in {"assignment", "exam"}
                    })
                )
            )
        ).all()
    }
    activities = {
        activity.id: activity
        for activity in db_session.exec(
            select(Activity).where(
                Activity.id.in_(
                    list({
                        row.assessment_id
                        for row in rollups
                        if row.assessment_type in {"quiz", "code_challenge"}
                    })
                )
            )
        ).all()
    }

    rows: list[AssessmentOutlierRow] = []
    for row in rollups:
        course = course_map.get(row.course_id)
        if course is None:
            continue
        if row.assessment_type == "assignment":
            title = (
                assessments.get(row.assessment_id).title
                if row.assessment_id in assessments
                else f"Задание {row.assessment_id}"
            )
        elif row.assessment_type == "exam":
            title = (
                assessments.get(row.assessment_id).title
                if row.assessment_id in assessments
                else f"Экзамен {row.assessment_id}"
            )
        else:
            title = (
                activities.get(row.assessment_id).name
                if row.assessment_id in activities
                else f"Оценивание {row.assessment_id}"
            )

        outlier_reason_codes: list[str] = []
        if row.submission_rate is not None and float(row.submission_rate) < 60:
            outlier_reason_codes.append("low_submission_rate")
        if row.pass_rate is not None and float(row.pass_rate) < 60:
            outlier_reason_codes.append("low_success_rate")
        if (
            row.grading_latency_hours_p90 is not None
            and float(row.grading_latency_hours_p90) > 72
        ):
            outlier_reason_codes.append("slow_feedback")

        rows.append(
            AssessmentOutlierRow(
                assessment_type=row.assessment_type,
                assessment_id=row.assessment_id,
                activity_id=row.activity_id,
                course_id=row.course_id,
                course_name=course.name,
                title=title,
                submission_rate=float(row.submission_rate)
                if row.submission_rate is not None
                else None,
                completion_rate=float(row.completion_rate)
                if row.completion_rate is not None
                else None,
                pass_rate=float(row.pass_rate) if row.pass_rate is not None else None,
                median_score=float(row.median_score)
                if row.median_score is not None
                else None,
                avg_attempts=float(row.avg_attempts)
                if row.avg_attempts is not None
                else None,
                grading_latency_hours_p50=float(row.grading_latency_hours_p50)
                if row.grading_latency_hours_p50 is not None
                else None,
                grading_latency_hours_p90=float(row.grading_latency_hours_p90)
                if row.grading_latency_hours_p90 is not None
                else None,
                difficulty_score=float(row.difficulty_score)
                if row.difficulty_score is not None
                else None,
                outlier_reason_codes=outlier_reason_codes,
            )
        )

    sort_by = filters.sort_by or "signals"
    reverse = filters.sort_order != "asc"
    sort_map = {
        "title": lambda current: current.title.lower(),
        "submission": lambda current: (
            current.submission_rate if current.submission_rate is not None else -1
        ),
        "pass": lambda current: (
            current.pass_rate if current.pass_rate is not None else -1
        ),
        "difficulty": lambda current: (
            current.difficulty_score if current.difficulty_score is not None else -1
        ),
        "latency": lambda current: (
            current.grading_latency_hours_p90
            if current.grading_latency_hours_p90 is not None
            else -1
        ),
        "signals": lambda current: len(current.outlier_reason_codes),
    }
    rows.sort(key=sort_map.get(sort_by, sort_map["signals"]), reverse=reverse)
    generated_at = max((row.generated_at for row in rollups), default=None)
    return to_iso(generated_at) or "", rows


def _is_allowed(user_id: int, allowed_user_ids: set[int] | None) -> bool:
    return allowed_user_ids is None or user_id in allowed_user_ids


def _score_bucket(score: float | None) -> str:
    if score is None:
        return "Неизвестно"
    lower = int(min(80, (score // 20) * 20))
    upper = lower + 19 if lower < 80 else 100
    return f"{lower}-{upper}"


def _attempt_distribution(attempts_by_user: dict[int, int]) -> list[HistogramBucket]:
    buckets = Counter()
    for attempts in attempts_by_user.values():
        label = str(attempts if attempts < 5 else "5+")
        buckets[label] += 1
    order = ["1", "2", "3", "4", "5+"]
    return [
        HistogramBucket(label=label, count=buckets.get(label, 0))
        for label in order
        if buckets.get(label, 0) > 0
    ]


def _score_distribution(scores: list[float]) -> list[HistogramBucket]:
    buckets = Counter(_score_bucket(score) for score in scores)
    order = ["0-19", "20-39", "40-59", "60-79", "80-100", "Неизвестно"]
    return [
        HistogramBucket(label=label, count=buckets.get(label, 0))
        for label in order
        if buckets.get(label, 0) > 0
    ]


def _score_variance(scores: list[float]) -> float | None:
    if len(scores) < 2:
        return None
    average = sum(scores) / len(scores)
    return round(sum((score - average) ** 2 for score in scores) / len(scores), 2)


def _reliability_score(scores: list[float]) -> float | None:
    variance = _score_variance(scores)
    if variance is None:
        return None
    # Normalize rough score spread to a 0-100 quality signal. Extremely low variance often
    # means the assessment is not separating learner performance; extremely high variance
    # usually means it is noisy or uneven.
    ideal_variance = 350.0
    distance = abs(variance - ideal_variance)
    return round(max(0.0, 100 - (distance / ideal_variance) * 100), 1)


def _discrimination_index(scores_by_user: dict[int, float]) -> float | None:
    if len(scores_by_user) < 4:
        return None
    ordered = sorted(scores_by_user.values())
    group_size = max(1, round(len(ordered) * 0.27))
    weak = ordered[:group_size]
    strong = ordered[-group_size:]
    return round((sum(strong) / len(strong) - sum(weak) / len(weak)) / 100, 2)


def _suspicious_flag(
    *,
    pass_rate: float | None,
    score_variance: float | None,
    discrimination: float | None,
) -> str | None:
    if pass_rate is not None and pass_rate >= 95:
        return "too_easy"
    if pass_rate is not None and pass_rate <= 20:
        return "too_hard"
    if discrimination is not None and discrimination < 0.15:
        return "low_discrimination"
    if score_variance is not None and score_variance < 25:
        return "low_variance"
    return None


def _quality_by_question_from_quiz_attempts(
    attempts: list,
) -> dict[str, dict[str, float | int]]:
    scored_attempts: list[tuple[float, object]] = []
    for attempt in attempts:
        if not attempt.end_ts or not attempt.max_score:
            continue
        score_pct = (float(attempt.score) / float(attempt.max_score)) * 100
        scored_attempts.append((score_pct, attempt))
    if len(scored_attempts) < 4:
        return {}
    ordered = sorted(scored_attempts, key=operator.itemgetter(0))
    group_size = max(1, round(len(ordered) * 0.27))
    weak = {id(attempt) for _score, attempt in ordered[:group_size]}
    strong = {id(attempt) for _score, attempt in ordered[-group_size:]}
    totals: dict[str, dict[str, int]] = defaultdict(
        lambda: {"strong": 0, "strong_miss": 0, "weak": 0, "weak_correct": 0}
    )
    for _score, attempt in scored_attempts:
        items = (attempt.grading_result or {}).get("items", [])
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            question_id = str(item.get("item_id") or item.get("question_id") or "")
            if not question_id:
                continue
            correct = item.get("correct")
            if id(attempt) in strong:
                totals[question_id]["strong"] += 1
                if correct is False:
                    totals[question_id]["strong_miss"] += 1
            if id(attempt) in weak:
                totals[question_id]["weak"] += 1
                if correct is True:
                    totals[question_id]["weak_correct"] += 1
    quality: dict[str, dict[str, float | int]] = {}
    for question_id, counts in totals.items():
        strong_accuracy = safe_pct(
            counts["strong"] - counts["strong_miss"], counts["strong"]
        )
        weak_accuracy = safe_pct(counts["weak_correct"], counts["weak"])
        if strong_accuracy is None or weak_accuracy is None:
            continue
        quality[question_id] = {
            "discrimination_index": round((strong_accuracy - weak_accuracy) / 100, 2),
            "strong_miss_pct": safe_pct(counts["strong_miss"], counts["strong"]) or 0.0,
            "weak_correct_pct": weak_accuracy,
            "distractor_issue_count": 1
            if counts["strong"]
            and (safe_pct(counts["strong_miss"], counts["strong"]) or 0) > 35
            else 0,
        }
    return quality


def _build_assignment_rows(
    context: AnalyticsContext,
    snapshots: dict[tuple[int, int], object],
    allowed_user_ids: set[int] | None,
    bucket_window: tuple[datetime, datetime] | None,
) -> list[AssessmentOutlierRow]:
    eligible_by_course: dict[int, set[int]] = defaultdict(set)
    for course_id, user_id in snapshots.items():
        eligible_by_course[course_id].add(user_id)

    submissions_by_assignment: dict[int, list] = defaultdict(list)
    for submission, assignment in context.assignment_submissions:
        if not _is_allowed(submission.user_id, allowed_user_ids):
            continue
        if not _in_bucket_window(assignment_submitted_at(submission), bucket_window):
            continue
        if assignment.id is not None:
            submissions_by_assignment[assignment.id].append((submission, assignment))

    rows: list[AssessmentOutlierRow] = []
    for assignment in context.assignments:
        assignment_id = assignment.id
        if assignment_id is None:
            continue
        submissions = submissions_by_assignment.get(assignment_id, [])
        eligible = len(eligible_by_course.get(assignment.course_id, set()))
        submitted = len({submission.user_id for submission, _ in submissions})
        graded = [
            submission
            for submission, _ in submissions
            if assignment_is_graded(submission)
            and assignment_score(submission) is not None
        ]
        grades = [assignment_score(submission) or 0.0 for submission in graded]
        scores_by_user = {
            submission.user_id: assignment_score(submission) or 0.0
            for submission in graded
        }
        pass_rate = safe_pct(
            sum(
                1
                for submission in graded
                if (assignment_score(submission) or 0.0) >= 60
            ),
            len(graded),
        )
        variance = _score_variance(grades)
        discrimination = _discrimination_index(scores_by_user)
        latency_hours = [
            value
            for value in (
                hours_between(
                    assignment_submitted_at(submission),
                    assignment_graded_at(submission),
                )
                for submission in graded
            )
            if value is not None
        ]
        difficulty_score = round(100 - pass_rate, 2) if pass_rate is not None else None
        outlier_reason_codes: list[str] = []
        submission_rate = safe_pct(submitted, eligible)
        if submission_rate is not None and submission_rate < 60:
            outlier_reason_codes.append("low_submission_rate")
        if pass_rate is not None and pass_rate < 60:
            outlier_reason_codes.append("low_pass_rate")
        if (
            latency_hours
            and percentile(latency_hours, 0.9)
            and percentile(latency_hours, 0.9) > 72
        ):
            outlier_reason_codes.append("grading_latency")

        course = context.courses_by_id[assignment.course_id]
        rows.append(
            AssessmentOutlierRow(
                assessment_type="assignment",
                assessment_id=assignment_id,
                activity_id=assignment.activity_id,
                course_id=assignment.course_id,
                course_name=course.name,
                title=assignment.title,
                submission_rate=submission_rate,
                completion_rate=submission_rate,
                pass_rate=pass_rate,
                median_score=median_or_none(grades),
                avg_attempts=1.0 if submitted else None,
                grading_latency_hours_p50=percentile(latency_hours, 0.5),
                grading_latency_hours_p90=percentile(latency_hours, 0.9),
                difficulty_score=difficulty_score,
                score_variance=variance,
                reliability_score=_reliability_score(grades),
                discrimination_index=discrimination,
                suspicious_flag=_suspicious_flag(
                    pass_rate=pass_rate,
                    score_variance=variance,
                    discrimination=discrimination,
                ),
                outlier_reason_codes=outlier_reason_codes,
            )
        )
    return rows


def _build_exam_rows(
    context: AnalyticsContext,
    snapshots: dict[tuple[int, int], object],
    allowed_user_ids: set[int] | None,
    bucket_window: tuple[datetime, datetime] | None,
) -> list[AssessmentOutlierRow]:
    eligible_by_course: dict[int, set[int]] = defaultdict(set)
    for course_id, user_id in snapshots.items():
        eligible_by_course[course_id].add(user_id)

    attempts_by_exam: dict[int, list] = defaultdict(list)
    for attempt, exam in context.exam_attempts:
        if not _is_allowed(attempt.user_id, allowed_user_ids):
            continue
        if not _in_bucket_window(
            attempt.submitted_at or attempt.started_at, bucket_window
        ):
            continue
        if exam.id is not None:
            attempts_by_exam[exam.id].append((attempt, exam))

    rows: list[AssessmentOutlierRow] = []
    for exam in context.exams:
        exam_id = exam.id
        if exam_id is None:
            continue
        attempts = attempts_by_exam.get(exam_id, [])
        eligible = len(eligible_by_course.get(exam.course_id, set()))
        submitted_users = {
            attempt.user_id for attempt, _ in attempts if attempt.submitted_at
        }
        scores = [
            score
            for attempt, _ in attempts
            if (score := assignment_score(attempt)) is not None
        ]
        scores_by_user = {
            attempt.user_id: score
            for attempt, _ in attempts
            if (score := assignment_score(attempt)) is not None
        }
        attempts_by_user = Counter(attempt.user_id for attempt, _ in attempts)
        threshold = assessment_pass_threshold(exam.settings)
        pass_rate = safe_pct(
            sum(1 for score in scores if score >= threshold), len(scores)
        )
        variance = _score_variance(scores)
        discrimination = _discrimination_index(scores_by_user)
        submission_rate = safe_pct(len(submitted_users), eligible)
        difficulty_score = round(100 - pass_rate, 2) if pass_rate is not None else None
        outlier_reason_codes: list[str] = []
        if submission_rate is not None and submission_rate < 60:
            outlier_reason_codes.append("low_completion_rate")
        if pass_rate is not None and pass_rate < threshold:
            outlier_reason_codes.append("below_threshold")

        course = context.courses_by_id[exam.course_id]
        rows.append(
            AssessmentOutlierRow(
                assessment_type="exam",
                assessment_id=exam_id,
                activity_id=exam.activity_id,
                course_id=exam.course_id,
                course_name=course.name,
                title=exam.title,
                submission_rate=submission_rate,
                completion_rate=submission_rate,
                pass_rate=pass_rate,
                median_score=median_or_none(scores),
                avg_attempts=round(
                    sum(attempts_by_user.values()) / len(attempts_by_user), 2
                )
                if attempts_by_user
                else None,
                grading_latency_hours_p50=None,
                grading_latency_hours_p90=None,
                difficulty_score=difficulty_score,
                score_variance=variance,
                reliability_score=_reliability_score(scores),
                discrimination_index=discrimination,
                suspicious_flag=_suspicious_flag(
                    pass_rate=pass_rate,
                    score_variance=variance,
                    discrimination=discrimination,
                ),
                outlier_reason_codes=outlier_reason_codes,
            )
        )
    return rows


def _build_quiz_rows(
    context: AnalyticsContext,
    snapshots: dict[tuple[int, int], object],
    allowed_user_ids: set[int] | None,
    bucket_window: tuple[datetime, datetime] | None,
) -> list[AssessmentOutlierRow]:
    eligible_by_course: dict[int, set[int]] = defaultdict(set)
    for course_id, user_id in snapshots.items():
        eligible_by_course[course_id].add(user_id)

    attempts_by_activity: dict[int, list] = defaultdict(list)
    for attempt, activity in context.quiz_attempts:
        if not _is_allowed(attempt.user_id, allowed_user_ids):
            continue
        if not _in_bucket_window(attempt.end_ts or attempt.start_ts, bucket_window):
            continue
        attempts_by_activity[activity.id].append((attempt, activity))

    rows: list[AssessmentOutlierRow] = []
    for activity_id, attempts in attempts_by_activity.items():
        activity = context.activities_by_id.get(activity_id)
        if activity is None or activity.course_id is None:
            continue
        eligible = len(eligible_by_course.get(activity.course_id, set()))
        submitted_users = {attempt.user_id for attempt, _ in attempts if attempt.end_ts}
        scores = [
            ((float(attempt.score) / float(attempt.max_score)) * 100)
            for attempt, _ in attempts
            if attempt.end_ts and attempt.max_score
        ]
        scores_by_user = {
            attempt.user_id: (float(attempt.score) / float(attempt.max_score)) * 100
            for attempt, _ in attempts
            if attempt.end_ts and attempt.max_score
        }
        attempts_by_user = Counter(attempt.user_id for attempt, _ in attempts)
        pass_rate = safe_pct(sum(1 for score in scores if score >= 60), len(scores))
        variance = _score_variance(scores)
        discrimination = _discrimination_index(scores_by_user)
        submission_rate = safe_pct(len(submitted_users), eligible)
        difficulty_score = round(100 - pass_rate, 2) if pass_rate is not None else None
        outlier_reason_codes: list[str] = []
        if submission_rate is not None and submission_rate < 60:
            outlier_reason_codes.append("low_completion_rate")
        if pass_rate is not None and pass_rate < 60:
            outlier_reason_codes.append("low_accuracy")
        course = context.courses_by_id[activity.course_id]
        rows.append(
            AssessmentOutlierRow(
                assessment_type="quiz",
                assessment_id=activity_id,
                activity_id=activity_id,
                course_id=activity.course_id,
                course_name=course.name,
                title=activity.name,
                submission_rate=submission_rate,
                completion_rate=submission_rate,
                pass_rate=pass_rate,
                median_score=median_or_none(scores),
                avg_attempts=round(
                    sum(attempts_by_user.values()) / len(attempts_by_user), 2
                )
                if attempts_by_user
                else None,
                grading_latency_hours_p50=None,
                grading_latency_hours_p90=None,
                difficulty_score=difficulty_score,
                score_variance=variance,
                reliability_score=_reliability_score(scores),
                discrimination_index=discrimination,
                suspicious_flag=_suspicious_flag(
                    pass_rate=pass_rate,
                    score_variance=variance,
                    discrimination=discrimination,
                ),
                outlier_reason_codes=outlier_reason_codes,
            )
        )
    return rows


def _build_code_rows(
    context: AnalyticsContext,
    snapshots: dict[tuple[int, int], object],
    allowed_user_ids: set[int] | None,
    bucket_window: tuple[datetime, datetime] | None,
) -> list[AssessmentOutlierRow]:
    eligible_by_course: dict[int, set[int]] = defaultdict(set)
    for course_id, user_id in snapshots.items():
        eligible_by_course[course_id].add(user_id)

    submissions_by_activity: dict[int, list] = defaultdict(list)
    for submission, activity in context.code_submissions:
        if not _is_allowed(submission.user_id, allowed_user_ids):
            continue
        if not _in_bucket_window(
            getattr(submission, "created_at", None), bucket_window
        ):
            continue
        submissions_by_activity[activity.id].append((submission, activity))

    rows: list[AssessmentOutlierRow] = []
    code_activities = [
        activity
        for activity in context.activities_by_id.values()
        if activity.course_id is not None
        and activity.activity_type == ActivityTypeEnum.TYPE_CODE_CHALLENGE
    ]
    for activity in code_activities:
        if activity.id is None:
            continue
        activity_id = activity.id
        submissions = submissions_by_activity.get(activity_id, [])
        eligible = len(eligible_by_course.get(activity.course_id, set()))
        submitted_users = {
            submission.user_id
            for submission, _ in submissions
            if assignment_is_graded(submission)
        }
        scores = [
            score
            for submission, _ in submissions
            if (score := assignment_score(submission)) is not None
        ]
        scores_by_user = {
            submission.user_id: score
            for submission, _ in submissions
            if (score := assignment_score(submission)) is not None
        }
        attempts_by_user = Counter(submission.user_id for submission, _ in submissions)
        pass_rate = safe_pct(sum(1 for score in scores if score >= 60), len(scores))
        variance = _score_variance(scores)
        discrimination = _discrimination_index(scores_by_user)
        submission_rate = safe_pct(len(submitted_users), eligible)
        difficulty_score = round(100 - pass_rate, 2) if pass_rate is not None else None
        outlier_reason_codes: list[str] = []
        if submission_rate is not None and submission_rate < 60:
            outlier_reason_codes.append("low_submission_rate")
        if pass_rate is not None and pass_rate < 60:
            outlier_reason_codes.append("low_success_rate")
        course = context.courses_by_id[activity.course_id]
        rows.append(
            AssessmentOutlierRow(
                assessment_type="code_challenge",
                assessment_id=activity_id,
                activity_id=activity_id,
                course_id=activity.course_id,
                course_name=course.name,
                title=activity.name,
                submission_rate=submission_rate,
                completion_rate=submission_rate,
                pass_rate=pass_rate,
                median_score=median_or_none(scores),
                avg_attempts=round(
                    sum(attempts_by_user.values()) / len(attempts_by_user), 2
                )
                if attempts_by_user
                else None,
                grading_latency_hours_p50=None,
                grading_latency_hours_p90=None,
                difficulty_score=difficulty_score,
                score_variance=variance,
                reliability_score=_reliability_score(scores),
                discrimination_index=discrimination,
                suspicious_flag=_suspicious_flag(
                    pass_rate=pass_rate,
                    score_variance=variance,
                    discrimination=discrimination,
                ),
                outlier_reason_codes=outlier_reason_codes,
            )
        )
    return rows


def build_assessment_rows(
    context: AnalyticsContext, filters: AnalyticsFilters | None = None
) -> list[AssessmentOutlierRow]:
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids if filters else [])
    snapshots = progress_snapshots(context, allowed_user_ids)
    bucket_window = _selected_bucket_window(filters)
    rows = [
        *_build_assignment_rows(context, snapshots, allowed_user_ids, bucket_window),
        *_build_quiz_rows(context, snapshots, allowed_user_ids, bucket_window),
        *_build_exam_rows(context, snapshots, allowed_user_ids, bucket_window),
        *_build_code_rows(context, snapshots, allowed_user_ids, bucket_window),
    ]
    sort_by = filters.sort_by if filters else None
    sort_order = filters.sort_order if filters else "desc"
    sort_map = {
        "title": lambda row: row.title.lower(),
        "submission": lambda row: (
            row.submission_rate if row.submission_rate is not None else -1
        ),
        "pass": lambda row: row.pass_rate if row.pass_rate is not None else -1,
        "difficulty": lambda row: (
            row.difficulty_score if row.difficulty_score is not None else -1
        ),
        "latency": lambda row: (
            row.grading_latency_hours_p90
            if row.grading_latency_hours_p90 is not None
            else -1
        ),
        "signals": lambda row: len(row.outlier_reason_codes),
    }
    rows.sort(
        key=sort_map.get(
            sort_by or "signals",
            lambda row: (
                len(row.outlier_reason_codes),
                row.difficulty_score or 0,
                -(row.submission_rate or 0),
            ),
        ),
        reverse=sort_order != "asc",
    )
    return rows


def get_teacher_assessment_list(
    db_session: Session, scope: TeacherAnalyticsScope, filters: AnalyticsFilters
) -> TeacherAssessmentListResponse:
    rollup_rows = _build_rollup_assessment_rows(db_session, scope, filters)
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
        return TeacherAssessmentListResponse(
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
    previous_start, _ = filters.previous_window_bounds()
    context = load_analytics_context(
        db_session, scope.course_ids, activity_start=previous_start
    )
    rows = build_assessment_rows(context, filters)
    paged_rows = rows[filters.offset : filters.offset + filters.page_size]
    return TeacherAssessmentListResponse(
        generated_at=to_iso(context.generated_at) or "",
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


def get_teacher_assessment_detail(
    db_session: Session,
    scope: TeacherAnalyticsScope,
    assessment_type: str,
    assessment_id: int,
    filters: AnalyticsFilters,
) -> TeacherAssessmentDetailResponse:
    # Resolve course_id with a targeted query before loading the full analytics context
    # so we only pull data for the one course that hosts this assessment.
    scoped_course_id: int | None = None
    if assessment_type in {"assignment", "exam"}:
        row = db_session.exec(
            select(Assessment).where(Assessment.id == assessment_id)
        ).first()
        if row is not None:
            activity = db_session.get(Activity, row.activity_id)
            if activity and activity.course_id in scope.course_ids:
                scoped_course_id = activity.course_id
    else:
        # Quiz and code_challenge assessments are Activity rows with a course_id field
        row = db_session.exec(
            select(Activity).where(Activity.id == assessment_id)
        ).first()
        if row and row.course_id in scope.course_ids:
            scoped_course_id = row.course_id

    context_course_ids = (
        [scoped_course_id] if scoped_course_id is not None else scope.course_ids
    )
    context = load_analytics_context(db_session, context_course_ids)
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    snapshots = progress_snapshots(context, allowed_user_ids)
    eligible_by_course: dict[int, set[int]] = defaultdict(set)
    for course_id, user_id in snapshots:
        eligible_by_course[course_id].add(user_id)

    if assessment_type == "assignment":
        assignment = next(
            (item for item in context.assignments if item.id == assessment_id), None
        )
        if assignment is None:
            msg = f"Задание не найдено: {assessment_id}"
            raise ValueError(msg)
        records = [
            (submission, assignment_)
            for submission, assignment_ in context.assignment_submissions
            if assignment_.id == assessment_id
            and _is_allowed(submission.user_id, allowed_user_ids)
        ]
        eligible = len(eligible_by_course.get(assignment.course_id, set()))
        scores = [
            score
            for submission, _ in records
            if assignment_is_graded(submission)
            for score in [assignment_score(submission)]
            if score is not None
        ]
        latencies = [
            value
            for value in (
                hours_between(
                    assignment_submitted_at(submission),
                    assignment_graded_at(submission),
                )
                for submission, _ in records
            )
            if value is not None
        ]
        attempts_by_user = Counter(submission.user_id for submission, _ in records)
        learner_rows = [
            AssessmentLearnerRow(
                user_id=submission.user_id,
                user_display_name=display_name(
                    context.users_by_id.get(submission.user_id)
                ),
                attempts=1,
                best_score=assignment_score(submission),
                last_score=assignment_score(submission),
                submitted_at=to_iso(assignment_submitted_at(submission)),
                graded_at=to_iso(assignment_graded_at(submission)),
                status=assignment_submission_status(submission),
            )
            for submission, _ in records
        ]
        common_failures = [
            CommonFailureRow(
                key="late",
                label="Просроченные отправки",
                count=sum(1 for submission, _ in records if submission.is_late),
            ),
            CommonFailureRow(
                key="ungraded",
                label="Ожидают проверки",
                count=sum(
                    1
                    for submission, _ in records
                    if assignment_is_reviewable(submission)
                ),
            ),
        ]
        common_failures = [item for item in common_failures if item.count > 0]
        pass_rate = safe_pct(sum(1 for score in scores if score >= 60), len(scores))
        return TeacherAssessmentDetailResponse(
            generated_at=to_iso(context.generated_at) or "",
            assessment_type="assignment",
            assessment_id=assessment_id,
            course_id=assignment.course_id,
            title=assignment.title,
            pass_threshold=60,
            pass_threshold_bucket_label=_score_bucket(60),
            summary=TeacherAssessmentDetailSummary(
                eligible_learners=eligible,
                submitted_learners=len({
                    submission.user_id for submission, _ in records
                }),
                submission_rate=safe_pct(
                    len({submission.user_id for submission, _ in records}), eligible
                ),
                pass_rate=pass_rate,
                median_score=median_or_none(scores),
                avg_attempts=1.0 if records else None,
                grading_latency_hours_p50=percentile(latencies, 0.5),
                grading_latency_hours_p90=percentile(latencies, 0.9),
            ),
            score_distribution=_score_distribution(scores),
            attempt_distribution=_attempt_distribution(dict(attempts_by_user)),
            question_breakdown=None,
            common_failures=common_failures,
            learner_rows=sorted(learner_rows, key=lambda row: row.user_display_name),
        )

    if assessment_type == "exam":
        exam = next((item for item in context.exams if item.id == assessment_id), None)
        if exam is None:
            msg = f"Экзамен не найден: {assessment_id}"
            raise ValueError(msg)
        records = [
            (attempt, exam_)
            for attempt, exam_ in context.exam_attempts
            if exam_.id == assessment_id
            and _is_allowed(attempt.user_id, allowed_user_ids)
        ]
        eligible = len(eligible_by_course.get(exam.course_id, set()))
        attempts_by_user = defaultdict(list)
        scores: list[float] = []
        for attempt, _exam in records:
            attempts_by_user[attempt.user_id].append(attempt)
            if (score := assignment_score(attempt)) is not None:
                scores.append(score)
        submitted_users = {
            attempt.user_id for attempt, _exam in records if attempt.submitted_at
        }
        learner_rows = []
        for user_id, attempts in attempts_by_user.items():
            best_score = max(
                (
                    score
                    for item in attempts
                    if (score := assignment_score(item)) is not None
                ),
                default=None,
            )
            last_attempt = max(
                attempts, key=lambda item: item.submitted_at or item.started_at or ""
            )
            last_score = assignment_score(last_attempt)
            learner_rows.append(
                AssessmentLearnerRow(
                    user_id=user_id,
                    user_display_name=display_name(context.users_by_id.get(user_id)),
                    attempts=len(attempts),
                    best_score=round(best_score, 2) if best_score is not None else None,
                    last_score=round(last_score, 2) if last_score is not None else None,
                    submitted_at=to_iso(last_attempt.submitted_at),
                    graded_at=None,
                    status=last_attempt.status.value,
                )
            )
        threshold = assessment_pass_threshold(exam.settings)
        return TeacherAssessmentDetailResponse(
            generated_at=to_iso(context.generated_at) or "",
            assessment_type="exam",
            assessment_id=assessment_id,
            course_id=exam.course_id,
            title=exam.title,
            pass_threshold=threshold,
            pass_threshold_bucket_label=_score_bucket(threshold),
            summary=TeacherAssessmentDetailSummary(
                eligible_learners=eligible,
                submitted_learners=len(submitted_users),
                submission_rate=safe_pct(len(submitted_users), eligible),
                pass_rate=safe_pct(
                    sum(1 for score in scores if score >= threshold), len(scores)
                ),
                median_score=median_or_none(scores),
                avg_attempts=round(
                    sum(len(items) for items in attempts_by_user.values())
                    / len(attempts_by_user),
                    2,
                )
                if attempts_by_user
                else None,
                grading_latency_hours_p50=None,
                grading_latency_hours_p90=None,
            ),
            score_distribution=_score_distribution(scores),
            attempt_distribution=_attempt_distribution({
                user_id: len(items) for user_id, items in attempts_by_user.items()
            }),
            question_breakdown=None,
            common_failures=[],
            learner_rows=sorted(learner_rows, key=lambda row: row.user_display_name),
        )

    if assessment_type == "quiz":
        activity = context.activities_by_id.get(assessment_id)
        if activity is None or activity.course_id is None:
            msg = f"Активность теста не найдена: {assessment_id}"
            raise ValueError(msg)
        records = [
            (attempt, activity_)
            for attempt, activity_ in context.quiz_attempts
            if activity_.id == assessment_id
            and _is_allowed(attempt.user_id, allowed_user_ids)
        ]
        eligible = len(eligible_by_course.get(activity.course_id, set()))
        attempts_by_user = defaultdict(list)
        scores: list[float] = []
        for attempt, _activity in records:
            attempts_by_user[attempt.user_id].append(attempt)
            if attempt.end_ts and attempt.max_score:
                scores.append((float(attempt.score) / float(attempt.max_score)) * 100)
        submitted_users = {
            attempt.user_id for attempt, _activity in records if attempt.end_ts
        }
        quality_by_question = _quality_by_question_from_quiz_attempts([
            attempt for attempt, _activity in records
        ])
        question_breakdown = []
        for stat in [
            item
            for item in context.quiz_question_stats
            if item.activity_id == assessment_id
        ]:
            quality = quality_by_question.get(stat.question_id, {})
            question_breakdown.append(
                QuestionDifficultyRow(
                    question_id=stat.question_id,
                    question_label=f"Вопрос {stat.question_id}",
                    accuracy_pct=safe_pct(stat.correct_count, stat.total_attempts),
                    avg_time_seconds=round(float(stat.avg_time_seconds), 2)
                    if stat.avg_time_seconds is not None
                    else None,
                    discrimination_index=quality.get("discrimination_index"),
                    strong_miss_pct=quality.get("strong_miss_pct"),
                    weak_correct_pct=quality.get("weak_correct_pct"),
                    distractor_issue_count=int(
                        quality.get("distractor_issue_count") or 0
                    ),
                )
            )
        common_failures = [
            CommonFailureRow(
                key=row.question_id,
                label=row.question_label,
                count=max(0, 100 - int(row.accuracy_pct or 0)),
            )
            for row in sorted(
                question_breakdown, key=lambda item: item.accuracy_pct or 100
            )[:5]
            if row.accuracy_pct is not None and row.accuracy_pct < 80
        ]
        learner_rows = []
        for user_id, attempts in attempts_by_user.items():
            ordered_attempts = sorted(
                attempts, key=lambda item: item.end_ts or item.start_ts
            )
            best_score = max(
                (
                    (float(item.score) / float(item.max_score)) * 100
                    for item in attempts
                    if item.max_score
                ),
                default=None,
            )
            last_attempt = ordered_attempts[-1]
            last_score = (
                (float(last_attempt.score) / float(last_attempt.max_score)) * 100
                if last_attempt.max_score
                else None
            )
            learner_rows.append(
                AssessmentLearnerRow(
                    user_id=user_id,
                    user_display_name=display_name(context.users_by_id.get(user_id)),
                    attempts=len(attempts),
                    best_score=round(best_score, 2) if best_score is not None else None,
                    last_score=round(last_score, 2) if last_score is not None else None,
                    submitted_at=to_iso(last_attempt.end_ts),
                    graded_at=None,
                    status="COMPLETED" if last_attempt.end_ts else "IN_PROGRESS",
                )
            )
        return TeacherAssessmentDetailResponse(
            generated_at=to_iso(context.generated_at) or "",
            assessment_type="quiz",
            assessment_id=assessment_id,
            course_id=activity.course_id,
            title=activity.name,
            pass_threshold=60,
            pass_threshold_bucket_label=_score_bucket(60),
            summary=TeacherAssessmentDetailSummary(
                eligible_learners=eligible,
                submitted_learners=len(submitted_users),
                submission_rate=safe_pct(len(submitted_users), eligible),
                pass_rate=safe_pct(
                    sum(1 for score in scores if score >= 60), len(scores)
                ),
                median_score=median_or_none(scores),
                avg_attempts=round(
                    sum(len(items) for items in attempts_by_user.values())
                    / len(attempts_by_user),
                    2,
                )
                if attempts_by_user
                else None,
                grading_latency_hours_p50=None,
                grading_latency_hours_p90=None,
            ),
            score_distribution=_score_distribution(scores),
            attempt_distribution=_attempt_distribution({
                user_id: len(items) for user_id, items in attempts_by_user.items()
            }),
            question_breakdown=sorted(
                question_breakdown, key=lambda row: row.accuracy_pct or 100
            ),
            common_failures=common_failures,
            learner_rows=sorted(learner_rows, key=lambda row: row.user_display_name),
        )

    if assessment_type == "code_challenge":
        activity = context.activities_by_id.get(assessment_id)
        if activity is None or activity.course_id is None:
            msg = f"Активность задачи по коду не найдена: {assessment_id}"
            raise ValueError(msg)
        records = [
            (submission, activity_)
            for submission, activity_ in context.code_submissions
            if activity_.id == assessment_id
            and _is_allowed(submission.user_id, allowed_user_ids)
        ]
        eligible = len(eligible_by_course.get(activity.course_id, set()))
        attempts_by_user = defaultdict(list)
        scores: list[float] = []
        failure_counter = Counter()
        for submission, _activity in records:
            attempts_by_user[submission.user_id].append(submission)
            score = assignment_score(submission)
            if score is not None:
                scores.append(score)
                failed_tests = (
                    (submission.grading_json or {}).get("failed_tests")
                    or (submission.grading_json or {}).get("failed")
                    or []
                )
                for failed in failed_tests:
                    key = str(failed.get("id") if isinstance(failed, dict) else failed)
                    failure_counter[key] += 1
        submitted_users = {
            submission.user_id
            for submission, _activity in records
            if assignment_is_graded(submission)
        }
        learner_rows = []
        for user_id, attempts in attempts_by_user.items():
            ordered_attempts = sorted(attempts, key=lambda item: item.created_at)
            best_score = max(
                (
                    score
                    for item in attempts
                    if (score := assignment_score(item)) is not None
                ),
                default=None,
            )
            last_attempt = ordered_attempts[-1]
            last_score = assignment_score(last_attempt)
            learner_rows.append(
                AssessmentLearnerRow(
                    user_id=user_id,
                    user_display_name=display_name(context.users_by_id.get(user_id)),
                    attempts=len(attempts),
                    best_score=round(best_score, 2) if best_score is not None else None,
                    last_score=round(last_score, 2) if last_score is not None else None,
                    submitted_at=to_iso(last_attempt.created_at),
                    graded_at=None,
                    status=last_attempt.status.value,
                )
            )
        common_failures = [
            CommonFailureRow(key=key, label=f"Проваленный тест {key}", count=count)
            for key, count in failure_counter.most_common(8)
        ]
        return TeacherAssessmentDetailResponse(
            generated_at=to_iso(context.generated_at) or "",
            assessment_type="code_challenge",
            assessment_id=assessment_id,
            course_id=activity.course_id,
            title=activity.name,
            pass_threshold=60,
            pass_threshold_bucket_label=_score_bucket(60),
            summary=TeacherAssessmentDetailSummary(
                eligible_learners=eligible,
                submitted_learners=len(submitted_users),
                submission_rate=safe_pct(len(submitted_users), eligible),
                pass_rate=safe_pct(
                    sum(1 for score in scores if score >= 60), len(scores)
                ),
                median_score=median_or_none(scores),
                avg_attempts=round(
                    sum(len(items) for items in attempts_by_user.values())
                    / len(attempts_by_user),
                    2,
                )
                if attempts_by_user
                else None,
                grading_latency_hours_p50=None,
                grading_latency_hours_p90=None,
            ),
            score_distribution=_score_distribution(scores),
            attempt_distribution=_attempt_distribution({
                user_id: len(items) for user_id, items in attempts_by_user.items()
            }),
            question_breakdown=None,
            common_failures=common_failures,
            learner_rows=sorted(learner_rows, key=lambda row: row.user_display_name),
        )

    msg = f"Неподдерживаемый тип оценивания: {assessment_type}"
    raise ValueError(msg)
