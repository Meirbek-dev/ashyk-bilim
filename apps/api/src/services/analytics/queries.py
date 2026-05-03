from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from statistics import median
from typing import Any, TypeVar

from sqlalchemy import select
from sqlmodel import Session
from zoneinfo import ZoneInfo

from src.db.assessments import Assessment
from src.db.courses.activities import Activity
from src.db.courses.certifications import CertificateUser, Certifications
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.courses.quiz import QuizAttempt, QuizQuestionStat
from src.db.grading.progress import ActivityProgress, CourseProgress
from src.db.grading.submissions import (
    AssessmentType,
    Submission,
    SubmissionStatus,
)
from src.db.trail_runs import TrailRun
from src.db.trail_steps import TrailStep
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import User

ModelT = TypeVar("ModelT")
LeftT = TypeVar("LeftT")
RightT = TypeVar("RightT")
UTC_ZONE = ZoneInfo("UTC")


@dataclass(slots=True)
class ActivityEvent:
    user_id: int
    course_id: int
    ts: datetime
    source: str
    assessment_type: str | None = None
    assessment_id: int | None = None
    activity_id: int | None = None


@dataclass(slots=True)
class ProgressSnapshot:
    course_id: int
    user_id: int
    completed_steps: int
    total_steps: int
    progress_pct: float
    is_completed: bool
    has_certificate: bool
    last_activity_at: datetime | None
    trailrun_id: int | None


@dataclass(slots=True)
class AssessmentAnalyticsRow:
    id: int
    activity_id: int
    course_id: int
    title: str
    settings: dict[str, object]


@dataclass(slots=True)
class AnalyticsContext:
    generated_at: datetime
    courses_by_id: dict[int, Course]
    activities_by_id: dict[int, Activity]
    chapters_by_id: dict[int, Chapter]
    course_chapters: list[Chapter]
    chapter_activities: list[Activity]
    trail_runs: list[TrailRun]
    trail_steps: list[TrailStep]
    activity_progress: list[ActivityProgress]
    course_progress: list[CourseProgress]
    certificates: list[tuple[CertificateUser, Certifications]]
    assignments: list[AssessmentAnalyticsRow]
    assignment_submissions: list[tuple[Submission, AssessmentAnalyticsRow]]
    exams: list[AssessmentAnalyticsRow]
    exam_attempts: list[tuple[Submission, AssessmentAnalyticsRow]]
    quiz_attempts: list[tuple[QuizAttempt, Activity]]
    quiz_question_stats: list[QuizQuestionStat]
    code_submissions: list[tuple[Submission, Activity]]
    users_by_id: dict[int, User]
    usergroup_names_by_id: dict[int, str]
    cohort_ids_by_user: dict[int, set[int]]


def _unwrap_model[ModelT](value: Any, model_type: type[ModelT]) -> ModelT:
    if isinstance(value, model_type):
        return value
    if hasattr(value, "_mapping"):
        for candidate in value._mapping.values():
            if isinstance(candidate, model_type):
                return candidate
    if isinstance(value, (tuple, list)):
        for candidate in value:
            if isinstance(candidate, model_type):
                return candidate
    msg = f"Expected {model_type.__name__}, got {type(value).__name__}"
    raise TypeError(msg)


def _unwrap_pair[LeftT, RightT](
    value: Any, left_type: type[LeftT], right_type: type[RightT]
) -> tuple[LeftT, RightT]:
    if isinstance(value, (tuple, list)):
        left = next(
            (candidate for candidate in value if isinstance(candidate, left_type)), None
        )
        right = next(
            (candidate for candidate in value if isinstance(candidate, right_type)),
            None,
        )
        if left is not None and right is not None:
            return left, right
    if hasattr(value, "_mapping"):
        mapped_values = list(value._mapping.values())
        left = next(
            (
                candidate
                for candidate in mapped_values
                if isinstance(candidate, left_type)
            ),
            None,
        )
        right = next(
            (
                candidate
                for candidate in mapped_values
                if isinstance(candidate, right_type)
            ),
            None,
        )
        if left is not None and right is not None:
            return left, right
    msg = f"Expected pair ({left_type.__name__}, {right_type.__name__}), got {type(value).__name__}"
    raise TypeError(msg)


def now_utc() -> datetime:
    return datetime.now(tz=UTC)


def parse_timestamp(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        if raw.endswith("Z"):
            raw = f"{raw[:-1]}+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return None


def to_iso(value: object) -> str | None:
    normalized = parse_timestamp(value)
    if normalized is None:
        return None
    normalized = normalized.astimezone(UTC)
    return normalized.isoformat().replace("+00:00", "Z")


def to_tz_iso(value: object, tzinfo: ZoneInfo) -> str | None:
    normalized = parse_timestamp(value)
    if normalized is None:
        return None
    return normalized.astimezone(tzinfo).isoformat()


def safe_pct(numerator: float, denominator: float, *, digits: int = 1) -> float | None:
    if not denominator:
        return None
    return round((float(numerator) / float(denominator)) * 100, digits)


def percentile(values: list[float], target: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 2)
    rank = (len(ordered) - 1) * target
    lower = int(rank)
    upper = min(lower + 1, len(ordered) - 1)
    weight = rank - lower
    result = ordered[lower] * (1 - weight) + ordered[upper] * weight
    return round(result, 2)


def median_or_none(values: list[float]) -> float | None:
    if not values:
        return None
    return round(float(median(values)), 2)


def direction_for_delta(delta_value: float | None) -> str:
    if delta_value is None:
        return "flat"
    if delta_value > 0:
        return "up"
    if delta_value < 0:
        return "down"
    return "flat"


def enum_value(value: object) -> str:
    return str(getattr(value, "value", value))


def assignment_submission_status(submission: Submission) -> str:
    return enum_value(submission.status)


def assignment_is_reviewable(submission: Submission) -> bool:
    return assignment_submission_status(submission) == SubmissionStatus.PENDING.value


def assignment_is_graded(submission: Submission) -> bool:
    return assignment_submission_status(submission) in {
        SubmissionStatus.GRADED.value,
        SubmissionStatus.PUBLISHED.value,
    }


def assignment_score(submission: Submission) -> float | None:
    score = submission.final_score
    if score is None and assignment_is_graded(submission):
        score = submission.auto_score
    return float(score) if score is not None else None


def assignment_submitted_at(submission: Submission) -> object:
    return submission.submitted_at or submission.updated_at or submission.created_at


def assignment_graded_at(submission: Submission) -> object | None:
    if not assignment_is_graded(submission):
        return None
    return submission.graded_at or submission.updated_at


def display_name(user: User | None) -> str:
    if user is None:
        return "Неизвестный пользователь"
    parts = [user.first_name, user.last_name]
    joined = " ".join(part for part in parts if part).strip()
    return joined or user.username or user.email


def bucket_start(ts: datetime, bucket: str, tzinfo: ZoneInfo = UTC_ZONE) -> datetime:
    normalized = ts.astimezone(tzinfo)
    if bucket == "week":
        start = normalized - timedelta(days=normalized.weekday())
        return start.replace(hour=0, minute=0, second=0, microsecond=0)
    return normalized.replace(hour=0, minute=0, second=0, microsecond=0)


def build_series(
    events: list[ActivityEvent],
    bucket: str,
    start: datetime,
    end: datetime,
    *,
    distinct_users: bool = False,
    tzinfo: ZoneInfo = UTC_ZONE,
) -> list[tuple[datetime, float]]:
    buckets: dict[datetime, float | set[int]] = {}
    cursor = bucket_start(start, bucket, tzinfo)
    end_local = end.astimezone(tzinfo)
    while cursor <= end_local:
        buckets[cursor] = set() if distinct_users else 0.0
        # Advance by calendar day/week to avoid DST drift: increment date then re-normalize
        next_date = cursor.date() + (
            timedelta(weeks=1) if bucket == "week" else timedelta(days=1)
        )
        cursor = datetime(
            next_date.year, next_date.month, next_date.day, 0, 0, 0, tzinfo=tzinfo
        )

    for event in events:
        if event.ts < start or event.ts > end:
            continue
        key = bucket_start(event.ts, bucket, tzinfo)
        if key not in buckets:
            buckets[key] = set() if distinct_users else 0.0
        if distinct_users:
            current = buckets[key]
            assert isinstance(current, set)
            current.add(event.user_id)
        else:
            current_count = buckets[key]
            assert not isinstance(current_count, set)
            buckets[key] = current_count + 1

    series: list[tuple[datetime, float]] = []
    for key in sorted(buckets.keys()):
        value = buckets[key]
        if isinstance(value, set):
            series.append((key, float(len(value))))
        else:
            series.append((key, value))
    return series


def cohort_user_ids(
    context: AnalyticsContext, cohort_ids: Iterable[int]
) -> set[int] | None:
    requested = list(cohort_ids)
    if not requested:
        return None
    # Only filter by cohort IDs that are known to this platform context.
    # If none of the requested IDs are known, return an empty set so the
    # caller does NOT silently fall back to showing all learners.
    normalized = {
        cohort_id
        for cohort_id in requested
        if cohort_id in context.usergroup_names_by_id
    }
    if not normalized:
        # Requested cohorts exist but none overlap with this scope — yield empty result
        return set()
    return {
        user_id
        for user_id, memberships in context.cohort_ids_by_user.items()
        if memberships & normalized
    }


def cohort_names_for_user(
    context: AnalyticsContext, user_id: int, cohort_ids: Iterable[int] | None = None
) -> list[str]:
    memberships = context.cohort_ids_by_user.get(user_id, set())
    if cohort_ids is not None:
        memberships &= set(cohort_ids)
    return [
        context.usergroup_names_by_id[group_id]
        for group_id in sorted(memberships)
        if group_id in context.usergroup_names_by_id
    ]


def load_analytics_context(
    db_session: Session,
    course_ids: list[int],
    *,
    activity_start: datetime | None = None,
    activity_end: datetime | None = None,
) -> AnalyticsContext:
    """Load analytics context for the given course IDs.

    ``activity_start`` and ``activity_end`` bound event-like assessment rows.  Progress rows
    (``TrailRun`` and ``TrailStep``) remain unbounded because they are also the denominator for
    enrolment, completion, and risk metrics.  Dropping old progress rows makes a quiet but still
    enrolled learner disappear from analytics entirely.
    """
    if not course_ids:
        return AnalyticsContext(
            generated_at=now_utc(),
            courses_by_id={},
            activities_by_id={},
            chapters_by_id={},
            course_chapters=[],
            chapter_activities=[],
            trail_runs=[],
            trail_steps=[],
            activity_progress=[],
            course_progress=[],
            certificates=[],
            assignments=[],
            assignment_submissions=[],
            exams=[],
            exam_attempts=[],
            quiz_attempts=[],
            quiz_question_stats=[],
            code_submissions=[],
            users_by_id={},
            usergroup_names_by_id={},
            cohort_ids_by_user={},
        )

    courses = [
        _unwrap_model(course, Course)
        for course in db_session.exec(
            select(Course).where(Course.id.in_(course_ids))
        ).all()
    ]
    course_map = {course.id: course for course in courses if course.id is not None}

    activities = [
        _unwrap_model(activity, Activity)
        for activity in db_session.exec(
            select(Activity).where(Activity.course_id.in_(course_ids))
        ).all()
    ]
    activity_map = {
        activity.id: activity for activity in activities if activity.id is not None
    }

    course_chapters = [
        _unwrap_model(item, Chapter)
        for item in db_session.exec(
            select(Chapter).where(Chapter.course_id.in_(course_ids))
        ).all()
    ]
    [item.id for item in course_chapters]

    chapter_map = {
        chapter.id: chapter for chapter in course_chapters if chapter.id is not None
    }

    chapter_activities = [
        _unwrap_model(item, Activity)
        for item in db_session.exec(
            select(Activity).where(Activity.course_id.in_(course_ids))
        ).all()
    ]

    trail_run_stmt = select(TrailRun).where(TrailRun.course_id.in_(course_ids))
    trail_runs = [
        _unwrap_model(run, TrailRun) for run in db_session.exec(trail_run_stmt).all()
    ]
    trail_step_stmt = select(TrailStep).where(TrailStep.course_id.in_(course_ids))
    if activity_end is not None:
        trail_step_stmt = trail_step_stmt.where(TrailStep.update_date <= activity_end)
    trail_steps = [
        _unwrap_model(step, TrailStep)
        for step in db_session.exec(trail_step_stmt).all()
    ]
    activity_progress = [
        _unwrap_model(row, ActivityProgress)
        for row in db_session.exec(
            select(ActivityProgress).where(ActivityProgress.course_id.in_(course_ids))
        ).all()
    ]
    course_progress = [
        _unwrap_model(row, CourseProgress)
        for row in db_session.exec(
            select(CourseProgress).where(CourseProgress.course_id.in_(course_ids))
        ).all()
    ]

    assessment_rows = [
        _unwrap_pair(row, Assessment, Activity)
        for row in db_session.exec(
            select(Assessment, Activity)
            .join(Activity, Activity.id == Assessment.activity_id)
            .where(Activity.course_id.in_(course_ids))
        ).all()
    ]
    analytics_assessments = [
        AssessmentAnalyticsRow(
            id=assessment.id or 0,
            activity_id=activity.id or 0,
            course_id=activity.course_id,
            title=assessment.title,
            settings=activity.settings if isinstance(activity.settings, dict) else {},
        )
        for assessment, activity in assessment_rows
        if assessment.id is not None and activity.id is not None
    ]
    assessments_by_activity = {row.activity_id: row for row in analytics_assessments}

    assignments = [
        row
        for row in analytics_assessments
        if any(
            assessment.activity_id == row.activity_id
            and str(assessment.kind) == AssessmentType.ASSIGNMENT.value
            for assessment, _activity in assessment_rows
        )
    ]
    assignment_activity_ids = [row.activity_id for row in assignments]
    assignment_submissions: list[tuple[Submission, AssessmentAnalyticsRow]] = []
    if assignment_activity_ids:
        submission_stmt = (
            select(Submission)
            .where(Submission.activity_id.in_(assignment_activity_ids))
            .where(Submission.assessment_type == AssessmentType.ASSIGNMENT)
            .where(Submission.status != SubmissionStatus.DRAFT)
        )
        if activity_start is not None:
            # Generic submissions reliably update this timestamp on submit or grading.
            submission_stmt = submission_stmt.where(
                Submission.updated_at >= activity_start
            )
        assignment_submissions = [
            (submission, assessments_by_activity[submission.activity_id])
            for submission in db_session.exec(submission_stmt).all()
            if submission.activity_id in assessments_by_activity
        ]

    exams = [
        row
        for row in analytics_assessments
        if any(
            assessment.activity_id == row.activity_id
            and str(assessment.kind) == AssessmentType.EXAM.value
            for assessment, _activity in assessment_rows
        )
    ]
    exam_activity_ids = [row.activity_id for row in exams]
    exam_attempts: list[tuple[Submission, AssessmentAnalyticsRow]] = []
    if exam_activity_ids:
        exam_attempt_stmt = (
            select(Submission)
            .where(Submission.activity_id.in_(exam_activity_ids))
            .where(Submission.assessment_type == AssessmentType.EXAM)
            .where(Submission.status != SubmissionStatus.DRAFT)
        )
        if activity_start is not None:
            exam_attempt_stmt = exam_attempt_stmt.where(
                Submission.started_at >= activity_start
            )
        exam_attempts = [
            (submission, assessments_by_activity[submission.activity_id])
            for submission in db_session.exec(exam_attempt_stmt).all()
            if submission.activity_id in assessments_by_activity
        ]

    activity_ids = [activity.id for activity in activities if activity.id is not None]
    quiz_attempts: list[tuple[QuizAttempt, Activity]] = []
    if activity_ids:
        quiz_attempt_stmt = (
            select(QuizAttempt, Activity)
            .join(Activity, Activity.id == QuizAttempt.activity_id)
            .where(Activity.id.in_(activity_ids))
        )
        if activity_start is not None:
            quiz_attempt_stmt = quiz_attempt_stmt.where(
                QuizAttempt.start_ts >= activity_start
            )
        quiz_attempts = [
            _unwrap_pair(row, QuizAttempt, Activity)
            for row in db_session.exec(quiz_attempt_stmt).all()
        ]

    quiz_question_stats: list[QuizQuestionStat] = []
    if activity_ids:
        quiz_question_stats = [
            _unwrap_model(stat, QuizQuestionStat)
            for stat in db_session.exec(
                select(QuizQuestionStat).where(
                    QuizQuestionStat.activity_id.in_(activity_ids)
                )
            ).all()
        ]

    code_submissions: list[tuple[Submission, Activity]] = []
    if activity_ids:
        code_submission_stmt = (
            select(Submission, Activity)
            .join(Activity, Activity.id == Submission.activity_id)
            .where(Activity.id.in_(activity_ids))
            .where(Submission.assessment_type == AssessmentType.CODE_CHALLENGE)
            .where(Submission.status != SubmissionStatus.DRAFT)
        )
        if activity_start is not None:
            code_submission_stmt = code_submission_stmt.where(
                Submission.created_at >= activity_start
            )
        code_submissions = [
            _unwrap_pair(row, Submission, Activity)
            for row in db_session.exec(code_submission_stmt).all()
        ]

    certificate_rows = [
        _unwrap_pair(row, CertificateUser, Certifications)
        for row in db_session.exec(
            select(CertificateUser, Certifications)
            .join(Certifications, Certifications.id == CertificateUser.certification_id)
            .where(Certifications.course_id.in_(course_ids))
        ).all()
    ]

    user_ids: set[int] = set()
    user_ids.update(trail_run.user_id for trail_run in trail_runs)
    user_ids.update(trail_step.user_id for trail_step in trail_steps)
    user_ids.update(progress.user_id for progress in activity_progress)
    user_ids.update(progress.user_id for progress in course_progress)
    user_ids.update(
        submission.user_id for submission, _assignment in assignment_submissions
    )
    user_ids.update(attempt.user_id for attempt, _exam in exam_attempts)
    user_ids.update(attempt.user_id for attempt, _activity in quiz_attempts)
    user_ids.update(submission.user_id for submission, _activity in code_submissions)
    user_ids.update(
        certificate.user_id for certificate, _certification in certificate_rows
    )
    creator_ids = {
        course.creator_id for course in courses if course.creator_id is not None
    }
    user_ids.update(creator_ids)

    users = []
    if user_ids:
        users = [
            _unwrap_model(user, User)
            for user in db_session.exec(
                select(User).where(User.id.in_(sorted(user_ids)))
            ).all()
        ]
    user_map = {user.id: user for user in users if user.id is not None}

    usergroup_names_by_id: dict[int, str] = {}
    cohort_ids_by_user: dict[int, set[int]] = defaultdict(set)
    if user_ids:
        # Scope to memberships for the users we already know — avoids loading every cohort
        # in the entire database, which becomes expensive on large platforms.
        membership_rows = [
            _unwrap_model(row, UserGroupUser)
            for row in db_session.exec(
                select(UserGroupUser).where(UserGroupUser.user_id.in_(sorted(user_ids)))
            ).all()
        ]
        for membership in membership_rows:
            cohort_ids_by_user[membership.user_id].add(membership.usergroup_id)
        # Only load the usergroup names that actually appear in those memberships.
        relevant_group_ids = {m.usergroup_id for m in membership_rows}
        if relevant_group_ids:
            usergroups = [
                _unwrap_model(usergroup, UserGroup)
                for usergroup in db_session.exec(
                    select(UserGroup).where(
                        UserGroup.id.in_(sorted(relevant_group_ids))
                    )
                ).all()
            ]
            usergroup_names_by_id = {
                usergroup.id: usergroup.name
                for usergroup in usergroups
                if usergroup.id is not None
            }

    return AnalyticsContext(
        generated_at=now_utc(),
        courses_by_id=course_map,
        activities_by_id=activity_map,
        chapters_by_id=chapter_map,
        course_chapters=course_chapters,
        chapter_activities=chapter_activities,
        trail_runs=trail_runs,
        trail_steps=trail_steps,
        activity_progress=activity_progress,
        course_progress=course_progress,
        certificates=certificate_rows,
        assignments=assignments,
        assignment_submissions=assignment_submissions,
        exams=exams,
        exam_attempts=exam_attempts,
        quiz_attempts=quiz_attempts,
        quiz_question_stats=quiz_question_stats,
        code_submissions=code_submissions,
        users_by_id=user_map,
        usergroup_names_by_id=usergroup_names_by_id,
        cohort_ids_by_user=dict(cohort_ids_by_user),
    )


def build_activity_events(
    context: AnalyticsContext, allowed_user_ids: set[int] | None = None
) -> list[ActivityEvent]:
    events: list[ActivityEvent] = []

    for progress in context.activity_progress:
        if allowed_user_ids is not None and progress.user_id not in allowed_user_ids:
            continue
        ts = (
            progress.last_activity_at
            or progress.submitted_at
            or progress.graded_at
            or progress.completed_at
            or progress.started_at
        )
        if ts is None:
            continue
        events.append(
            ActivityEvent(
                user_id=progress.user_id,
                course_id=progress.course_id,
                ts=ts,
                source="activity_progress",
                activity_id=progress.activity_id,
            )
        )

    for attempt, activity in context.quiz_attempts:
        if allowed_user_ids is not None and attempt.user_id not in allowed_user_ids:
            continue
        ts = parse_timestamp(attempt.end_ts)
        if ts is None or activity.course_id is None:
            continue
        events.append(
            ActivityEvent(
                user_id=attempt.user_id,
                course_id=activity.course_id,
                ts=ts,
                source="quiz",
                assessment_type="quiz",
                assessment_id=activity.id,
                activity_id=activity.id,
            )
        )

    for attempt, exam in context.exam_attempts:
        if allowed_user_ids is not None and attempt.user_id not in allowed_user_ids:
            continue
        ts = parse_timestamp(attempt.submitted_at) or parse_timestamp(
            attempt.started_at
        )
        if ts is None:
            continue
        events.append(
            ActivityEvent(
                user_id=attempt.user_id,
                course_id=exam.course_id,
                ts=ts,
                source="exam",
                assessment_type="exam",
                assessment_id=exam.id,
                activity_id=exam.activity_id,
            )
        )

    for submission, assignment in context.assignment_submissions:
        if allowed_user_ids is not None and submission.user_id not in allowed_user_ids:
            continue
        ts = (
            parse_timestamp(getattr(submission, "submitted_at", None))
            or parse_timestamp(submission.updated_at)
            or parse_timestamp(submission.created_at)
        )
        if ts is None:
            continue
        events.append(
            ActivityEvent(
                user_id=submission.user_id,
                course_id=assignment.course_id,
                ts=ts,
                source="assignment",
                assessment_type="assignment",
                assessment_id=assignment.id,
                activity_id=assignment.activity_id,
            )
        )

    for submission, activity in context.code_submissions:
        if allowed_user_ids is not None and submission.user_id not in allowed_user_ids:
            continue
        if (
            submission.status
            not in {SubmissionStatus.GRADED, SubmissionStatus.PUBLISHED}
            or activity.course_id is None
        ):
            continue
        ts = parse_timestamp(submission.created_at)
        if ts is None:
            continue
        events.append(
            ActivityEvent(
                user_id=submission.user_id,
                course_id=activity.course_id,
                ts=ts,
                source="code_challenge",
                assessment_type="code_challenge",
                assessment_id=activity.id,
                activity_id=activity.id,
            )
        )

    return events


def progress_snapshots(
    context: AnalyticsContext, allowed_user_ids: set[int] | None = None
) -> dict[tuple[int, int], ProgressSnapshot]:
    # Canonical required-course progress comes from ActivityProgress and
    # CourseProgress. TrailStep is intentionally excluded here; it is personal
    # trail UX state and must not drive certificates or teacher analytics.
    activity_progress_by_course_user: dict[tuple[int, int], list[ActivityProgress]] = (
        defaultdict(list)
    )
    for progress in context.activity_progress:
        if allowed_user_ids is not None and progress.user_id not in allowed_user_ids:
            continue
        activity_progress_by_course_user[progress.course_id, progress.user_id].append(
            progress
        )

    course_progress_by_course_user: dict[tuple[int, int], CourseProgress] = {}
    for progress in context.course_progress:
        if allowed_user_ids is not None and progress.user_id not in allowed_user_ids:
            continue
        course_progress_by_course_user[progress.course_id, progress.user_id] = progress

    trailrun_by_course_user: dict[tuple[int, int], int] = {}
    for trail_run in context.trail_runs:
        if allowed_user_ids is not None and trail_run.user_id not in allowed_user_ids:
            continue
        trailrun_by_course_user[trail_run.course_id, trail_run.user_id] = (
            trail_run.id or 0
        )

    certificate_pairs = {
        (certification.course_id, certificate.user_id)
        for certificate, certification in context.certificates
        if allowed_user_ids is None or certificate.user_id in allowed_user_ids
    }

    last_activity: dict[tuple[int, int], datetime] = {}
    for event in build_activity_events(context, allowed_user_ids):
        key = (event.course_id, event.user_id)
        existing = last_activity.get(key)
        if existing is None or event.ts > existing:
            last_activity[key] = event.ts

    snapshots: dict[tuple[int, int], ProgressSnapshot] = {}
    seen_pairs = {
        *(activity_progress_by_course_user.keys()),
        *(course_progress_by_course_user.keys()),
        *(trailrun_by_course_user.keys()),
        *certificate_pairs,
    }
    for course_id, user_id in seen_pairs:
        course_progress = course_progress_by_course_user.get((course_id, user_id))
        activity_rows = activity_progress_by_course_user.get((course_id, user_id), [])
        if course_progress is not None:
            total_steps = course_progress.total_required_count
            completed_steps = course_progress.completed_required_count
            progress_pct = float(course_progress.progress_pct)
            is_completed = bool(course_progress.certificate_eligible)
            progress_last_activity = course_progress.last_activity_at
        else:
            total_steps = sum(1 for row in activity_rows if row.required)
            completed_steps = sum(
                1
                for row in activity_rows
                if row.required and row.completed_at is not None
            )
            progress_pct = (
                round((completed_steps / total_steps) * 100, 1) if total_steps else 0.0
            )
            is_completed = total_steps > 0 and completed_steps >= total_steps
            progress_last_activity = max(
                (row.last_activity_at for row in activity_rows if row.last_activity_at),
                default=None,
            )
        has_certificate = (course_id, user_id) in certificate_pairs
        is_completed = has_certificate or is_completed
        if total_steps == 0 and has_certificate:
            progress_pct = 100.0
        snapshots[course_id, user_id] = ProgressSnapshot(
            course_id=course_id,
            user_id=user_id,
            completed_steps=completed_steps,
            total_steps=total_steps,
            progress_pct=100.0 if is_completed else progress_pct,
            is_completed=is_completed,
            has_certificate=has_certificate,
            last_activity_at=progress_last_activity
            or last_activity.get((course_id, user_id)),
            trailrun_id=trailrun_by_course_user.get((course_id, user_id)),
        )
    return snapshots


def course_last_content_update(
    context: AnalyticsContext, course_id: int
) -> datetime | None:
    candidates: list[datetime] = []
    course = context.courses_by_id.get(course_id)
    if course is not None:
        course_ts = parse_timestamp(course.update_date)
        if course_ts is not None:
            candidates.append(course_ts)
    for activity in context.activities_by_id.values():
        if activity.course_id != course_id:
            continue
        activity_ts = parse_timestamp(activity.update_date)
        if activity_ts is not None:
            candidates.append(activity_ts)
    return max(candidates) if candidates else None


def hours_between(start_value: object, end_value: object) -> float | None:
    start = parse_timestamp(start_value)
    end = parse_timestamp(end_value)
    if start is None or end is None or end < start:
        return None
    return round((end - start).total_seconds() / 3600, 2)


def assessment_pass_threshold(settings: dict | None) -> float:
    raw = (settings or {}).get("passing_score", 60)
    try:
        return float(raw)
    except TypeError, ValueError:
        return 60.0
