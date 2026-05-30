from __future__ import annotations

import operator
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlmodel import Session

from src.db.assessments import Assessment
from src.db.courses.activities import Activity, ActivityTypeEnum
from src.db.courses.courses import Course
from src.db.grading.bulk_actions import BulkAction
from src.db.grading.entries import GradingEntry
from src.db.grading.submissions import AssessmentType as SubmissionAssessmentType, Submission, SubmissionStatus
from src.db.usergroups import UserGroup
from src.db.users import User
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    AnalyticsContext,
    ProgressSnapshot,
    assessment_pass_threshold,
    bucket_start as normalize_bucket_start,
    cohort_user_ids,
    display_name,
    hours_between,
    load_analytics_context,
    manual_assessment_graded_at,
    manual_assessment_is_graded,
    manual_assessment_is_reviewable,
    manual_assessment_score,
    manual_assessment_submission_status,
    manual_assessment_submitted_at,
    median_or_none,
    parse_timestamp,
    percentile,
    progress_snapshots,
    safe_pct,
    to_iso,
)
from src.services.analytics.rollups import (
    list_latest_assessment_rollups,
    supports_rollup_reads,
)
from src.services.analytics.schemas import (
    AnalyticsFilterOption,
    AssessmentAuditEventRow,
    AssessmentCohortRow,
    AssessmentDiagnosticsSnapshot,
    AssessmentItemAnalyticsRow,
    AssessmentLearnerRow,
    AssessmentMigrationStatus,
    AssessmentOutlierRow,
    AssessmentSloSnapshot,
    AssessmentSupportAlertRow,
    AssessmentSupportDiagnostics,
    CommonFailureRow,
    HistogramBucket,
    QuestionDifficultyRow,
    TeacherAssessmentDetailResponse,
    TeacherAssessmentDetailSummary,
    TeacherAssessmentListResponse,
)
from src.services.analytics.scope import TeacherAnalyticsScope


@dataclass
class _CohortRollupAccumulator:
    eligible_learners: int = 0
    submitted_learners: int = 0
    released_learners: int = 0
    awaiting_grading: int = 0
    returned_for_resubmission: int = 0
    passers: int = 0
    scored_learners: int = 0
    attempt_total: int = 0
    attempt_learners: int = 0
    scores: list[float] = field(default_factory=list)


def _selected_bucket_window(
    filters: AnalyticsFilters | None,
) -> tuple[datetime, datetime] | None:
    if filters is None or filters.bucket_start is None:
        return None
    selected = filters.bucket_start
    if selected.tzinfo is None:
        selected = selected.replace(tzinfo=UTC)
    local_start = normalize_bucket_start(selected, filters.bucket, filters.tzinfo)
    local_end = local_start + (timedelta(weeks=1) if filters.bucket == "week" else timedelta(days=1))
    return local_start.astimezone(UTC), local_end.astimezone(UTC)


def _in_bucket_window(value: object, bucket_window: tuple[datetime, datetime] | None) -> bool:
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
            select(Course).where(Course.id.in_(list({row.course_id for row in rollups})))
        ).all()
    }
    assessments = {
        assessment.id: assessment
        for assessment in db_session.exec(
            select(Assessment).where(
                Assessment.id.in_(
                    list({row.assessment_id for row in rollups if row.assessment_type in {"manual_assessment", "exam"}})
                )
            )
        ).all()
    }
    activities = {
        activity.id: activity
        for activity in db_session.exec(
            select(Activity).where(
                Activity.id.in_(
                    list({row.assessment_id for row in rollups if row.assessment_type in {"quiz", "code_challenge"}})
                )
            )
        ).all()
    }

    rows: list[AssessmentOutlierRow] = []
    for row in rollups:
        course = course_map.get(row.course_id)
        if course is None:
            continue
        if row.assessment_type == "manual_assessment":
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
        if row.grading_latency_hours_p90 is not None and float(row.grading_latency_hours_p90) > 72:
            outlier_reason_codes.append("slow_feedback")

        rows.append(
            AssessmentOutlierRow(
                assessment_type=row.assessment_type,
                assessment_id=row.assessment_id,
                activity_id=row.activity_id,
                course_id=row.course_id,
                course_name=course.name,
                title=title,
                submission_rate=float(row.submission_rate) if row.submission_rate is not None else None,
                completion_rate=float(row.completion_rate) if row.completion_rate is not None else None,
                pass_rate=float(row.pass_rate) if row.pass_rate is not None else None,
                median_score=float(row.median_score) if row.median_score is not None else None,
                avg_attempts=float(row.avg_attempts) if row.avg_attempts is not None else None,
                grading_latency_hours_p50=float(row.grading_latency_hours_p50)
                if row.grading_latency_hours_p50 is not None
                else None,
                grading_latency_hours_p90=float(row.grading_latency_hours_p90)
                if row.grading_latency_hours_p90 is not None
                else None,
                difficulty_score=float(row.difficulty_score) if row.difficulty_score is not None else None,
                outlier_reason_codes=outlier_reason_codes,
            )
        )

    sort_by = filters.sort_by or "signals"
    reverse = filters.sort_order != "asc"
    sort_map = {
        "title": lambda current: current.title.lower(),
        "submission": lambda current: current.submission_rate if current.submission_rate is not None else -1,
        "pass": lambda current: current.pass_rate if current.pass_rate is not None else -1,
        "difficulty": lambda current: current.difficulty_score if current.difficulty_score is not None else -1,
        "latency": lambda current: (
            current.grading_latency_hours_p90 if current.grading_latency_hours_p90 is not None else -1
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
    buckets: Counter[str] = Counter()
    for attempts in attempts_by_user.values():
        label = str(attempts if attempts < 5 else "5+")
        buckets[label] += 1
    order = ["1", "2", "3", "4", "5+"]
    return [HistogramBucket(label=label, count=buckets.get(label, 0)) for label in order if buckets.get(label, 0) > 0]


def _score_distribution(scores: list[float]) -> list[HistogramBucket]:
    buckets = Counter(_score_bucket(score) for score in scores)
    order = ["0-19", "20-39", "40-59", "60-79", "80-100", "Неизвестно"]
    return [HistogramBucket(label=label, count=buckets.get(label, 0)) for label in order if buckets.get(label, 0) > 0]


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


def _quality_by_question_from_quiz_submissions(
    submissions: list[Submission],
) -> dict[str, dict[str, float | int]]:
    scored_submissions: list[tuple[float, Submission]] = []
    for submission in submissions:
        if (score := manual_assessment_score(submission)) is None:
            continue
        scored_submissions.append((score, submission))
    if len(scored_submissions) < 4:
        return {}
    ordered = sorted(scored_submissions, key=operator.itemgetter(0))
    group_size = max(1, round(len(ordered) * 0.27))
    weak = {id(submission) for _score, submission in ordered[:group_size]}
    strong = {id(submission) for _score, submission in ordered[-group_size:]}
    totals: dict[str, dict[str, int]] = defaultdict(
        lambda: {"strong": 0, "strong_miss": 0, "weak": 0, "weak_correct": 0}
    )
    for _score, submission in scored_submissions:
        grading_json = submission.grading_json if isinstance(submission.grading_json, dict) else {}
        items = grading_json.get("items", [])
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            question_id = str(item.get("item_id") or item.get("question_id") or "")
            if not question_id:
                continue
            correct = item.get("correct")
            if id(submission) in strong:
                totals[question_id]["strong"] += 1
                if correct is False:
                    totals[question_id]["strong_miss"] += 1
            if id(submission) in weak:
                totals[question_id]["weak"] += 1
                if correct is True:
                    totals[question_id]["weak_correct"] += 1
    quality: dict[str, dict[str, float | int]] = {}
    for question_id, counts in totals.items():
        strong_accuracy = safe_pct(counts["strong"] - counts["strong_miss"], counts["strong"])
        weak_accuracy = safe_pct(counts["weak_correct"], counts["weak"])
        if strong_accuracy is None or weak_accuracy is None:
            continue
        quality[question_id] = {
            "discrimination_index": round((strong_accuracy - weak_accuracy) / 100, 2),
            "strong_miss_pct": safe_pct(counts["strong_miss"], counts["strong"]) or 0.0,
            "weak_correct_pct": weak_accuracy,
            "distractor_issue_count": 1
            if counts["strong"] and (safe_pct(counts["strong_miss"], counts["strong"]) or 0) > 35
            else 0,
        }
    return quality


def _submission_has_suspicion(submission: Submission) -> bool:
    metadata = submission.metadata_json if isinstance(submission.metadata_json, dict) else {}
    violations = metadata.get("violations")
    violation_count = metadata.get("violation_count")
    plagiarism = metadata.get("plagiarism")
    return (
        (isinstance(violations, list) and len(violations) > 0)
        or (violation_count is not None and int(violation_count) > 0)
        or (isinstance(plagiarism, dict) and bool(plagiarism.get("flagged")))
    )


def _submission_missing_score(submission: Submission) -> bool:
    status = manual_assessment_submission_status(submission)
    if status == SubmissionStatus.DRAFT.value:
        return False
    return manual_assessment_score(submission) is None


def _submission_latencies(submissions: list[Submission]) -> list[float]:
    return [
        value
        for value in (
            hours_between(
                manual_assessment_submitted_at(submission),
                manual_assessment_graded_at(submission),
            )
            for submission in submissions
        )
        if value is not None
    ]


def _build_submission_diagnostics(
    submissions: list[Submission],
    *,
    manual_grading_required: bool,
    note: str | None = None,
) -> AssessmentDiagnosticsSnapshot:
    status_counts = Counter(manual_assessment_submission_status(submission) for submission in submissions)
    stale_backlog = sum(
        1
        for submission in submissions
        if manual_assessment_submission_status(submission) == SubmissionStatus.PENDING.value
        and (hours_between(manual_assessment_submitted_at(submission), datetime.now(UTC)) or 0.0) > 72
    )
    return AssessmentDiagnosticsSnapshot(
        manual_grading_required=manual_grading_required,
        total_attempt_records=len(submissions),
        draft_attempts=status_counts.get(SubmissionStatus.DRAFT.value, 0),
        awaiting_grading=status_counts.get(SubmissionStatus.PENDING.value, 0),
        graded_not_released=status_counts.get(SubmissionStatus.GRADED.value, 0),
        returned_for_resubmission=status_counts.get(SubmissionStatus.RETURNED.value, 0),
        released=status_counts.get(SubmissionStatus.PUBLISHED.value, 0),
        late_submissions=sum(1 for submission in submissions if submission.is_late),
        stale_backlog=stale_backlog,
        suspicious_attempts=sum(1 for submission in submissions if _submission_has_suspicion(submission)),
        missing_scores=sum(1 for submission in submissions if _submission_missing_score(submission)),
        note=note,
    )


def _build_slo_snapshot(
    diagnostics: AssessmentDiagnosticsSnapshot,
    latencies: list[float],
) -> AssessmentSloSnapshot:
    target_hours = 72.0
    if not diagnostics.manual_grading_required and diagnostics.awaiting_grading == 0:
        return AssessmentSloSnapshot(
            status="not_applicable",
            target_hours=None,
            observed_p50_hours=None,
            observed_p90_hours=None,
            backlog_count=0,
            overdue_backlog_count=0,
            note="Это оценивание в настоящее время не зависит от регламента проверки преподавателем.",
        )

    observed_p50 = percentile(latencies, 0.5)
    observed_p90 = percentile(latencies, 0.9)
    overdue_backlog = diagnostics.stale_backlog
    if overdue_backlog > 0 or (observed_p90 is not None and observed_p90 > target_hours):
        status = "breached"
    elif diagnostics.awaiting_grading > 0 or (observed_p50 is not None and observed_p50 > 48):
        status = "warning"
    else:
        status = "healthy"

    if status == "breached":
        note = "Очередь проверки оценивания выходит за пределы 72-часовой цели."
    elif status == "warning":
        note = "Очередь проверки оценивания приближается к 72-часовой цели."
    else:
        note = "Очередь проверки оценивания находится в пределах целевого диапазона."

    return AssessmentSloSnapshot(
        status=status,
        target_hours=target_hours,
        observed_p50_hours=observed_p50,
        observed_p90_hours=observed_p90,
        backlog_count=diagnostics.awaiting_grading,
        overdue_backlog_count=overdue_backlog,
        note=note,
    )


def _resolve_actor_names(db_session: Session, actor_ids: set[int]) -> dict[int, str]:
    if not actor_ids:
        return {}
    users = db_session.exec(select(User).where(User.id.in_(sorted(actor_ids)))).scalars().all()
    return {user.id: display_name(user) for user in users if user.id is not None}


def _load_audit_history(
    db_session: Session,
    *,
    activity_id: int,
    submission_ids: list[int],
    allowed_user_ids: set[int] | None,
) -> list[AssessmentAuditEventRow]:
    entries = (
        db_session
        .exec(
            select(GradingEntry)
            .where(GradingEntry.submission_id.in_(submission_ids or [-1]))
            .order_by(GradingEntry.created_at.desc())
        )
        .scalars()
        .all()
    )
    actions = (
        db_session
        .exec(select(BulkAction).where(BulkAction.activity_id == activity_id).order_by(BulkAction.created_at.desc()))
        .scalars()
        .all()
    )

    visible_actions: list[BulkAction] = []
    for action in actions:
        targets = {int(user_id) for user_id in action.target_user_ids or []}
        if allowed_user_ids is None or not targets or targets & allowed_user_ids:
            visible_actions.append(action)

    actor_ids = {
        actor_id
        for actor_id in [
            *(entry.graded_by for entry in entries if entry.graded_by is not None),
            *(action.performed_by for action in visible_actions),
        ]
        if actor_id is not None
    }
    actor_names = _resolve_actor_names(db_session, actor_ids)

    sortable_events: list[tuple[datetime, AssessmentAuditEventRow]] = []
    for entry in entries:
        published = entry.published_at is not None
        occurred_at = entry.published_at or entry.created_at
        sortable_events.append((
            occurred_at,
            AssessmentAuditEventRow(
                id=f"grading-entry-{entry.id}",
                source="grading_entry",
                action="publish_grade" if published else "save_grade",
                actor_user_id=entry.graded_by,
                actor_display_name=actor_names.get(entry.graded_by or -1),
                occurred_at=to_iso(occurred_at) or "",
                status="published" if published else "draft_saved",
                summary=(
                    f"Опубликовано {entry.final_score:.1f}%"
                    if published
                    else f"Сохранен черновик оценки {entry.final_score:.1f}%"
                ),
                affected_count=1,
                submission_id=entry.submission_id,
            ),
        ))

    for action in visible_actions:
        occurred_at = action.completed_at or action.created_at
        action_type_value = (
            action.action_type.value if hasattr(action.action_type, "value") else str(action.action_type)
        )
        action_status_value = action.status.value if hasattr(action.status, "value") else str(action.status)
        action_name = action_type_value.lower()
        sortable_events.append((
            occurred_at,
            AssessmentAuditEventRow(
                id=f"bulk-action-{action.id}",
                source="bulk_action",
                action=action_name,
                actor_user_id=action.performed_by,
                actor_display_name=actor_names.get(action.performed_by),
                occurred_at=to_iso(occurred_at) or "",
                status=action_status_value.lower(),
                summary=(f"{action_type_value.replace('_', ' ').title()} for {action.affected_count} learners"),
                affected_count=action.affected_count,
            ),
        ))

    sortable_events.sort(key=operator.itemgetter(0), reverse=True)
    return [event for _occurred_at, event in sortable_events[:20]]


def _canonical_submission_count(
    db_session: Session,
    *,
    activity_id: int,
    assessment_type: SubmissionAssessmentType,
) -> int:
    return len(
        db_session.exec(
            select(Submission.id).where(
                Submission.activity_id == activity_id,
                Submission.assessment_type == assessment_type,
            )
        ).all()
    )


def _build_migration_status(
    db_session: Session,
    *,
    assessment_type: str,
    activity_id: int,
) -> AssessmentMigrationStatus:
    canonical_type = {
        "quiz": SubmissionAssessmentType.QUIZ,
        "exam": SubmissionAssessmentType.EXAM,
        "code_challenge": SubmissionAssessmentType.CODE_CHALLENGE,
        "manual_assessment": SubmissionAssessmentType.EXAM,
    }[assessment_type]
    canonical_row_count = _canonical_submission_count(
        db_session,
        activity_id=activity_id,
        assessment_type=canonical_type,
    )
    return AssessmentMigrationStatus(
        is_canonical=True,
        canonical_row_count=canonical_row_count,
        cutover_ready=True,
        compatibility_mode="canonical",
        note="Assessment analytics detail is backed by canonical submission and grading records.",
    )


def _build_workflow_item_rows(
    diagnostics: AssessmentDiagnosticsSnapshot,
) -> list[AssessmentItemAnalyticsRow]:
    total = diagnostics.total_attempt_records
    priority_by_item_key = {
        "awaiting_grading": 0,
        "missing_scores": 1,
        "suspicious_attempts": 2,
        "returned_for_resubmission": 3,
        "late_submissions": 4,
    }
    definitions = [
        (
            "awaiting_grading",
            "Ожидает проверки преподавателем",
            diagnostics.awaiting_grading,
            "critical" if diagnostics.stale_backlog else "watch",
            "Ручная проверка этих учащихся все еще ожидается.",
        ),
        (
            "returned_for_resubmission",
            "Возвращено на доработку",
            diagnostics.returned_for_resubmission,
            "watch",
            "Учащимся все еще нужно повторно отправить работу после обратной связи преподавателя.",
        ),
        (
            "late_submissions",
            "Просроченные отправки",
            diagnostics.late_submissions,
            "watch",
            "Просроченные работы могут требовать уточнения сроков или политики.",
        ),
        (
            "suspicious_attempts",
            "Подозрительные попытки",
            diagnostics.suspicious_attempts,
            "critical",
            "Для этих попыток были зафиксированы сигналы нарушения целостности.",
        ),
        (
            "missing_scores",
            "Отсутствующие баллы",
            diagnostics.missing_scores,
            "critical",
            "Существует отправка без балла, которую служба поддержки может проверить.",
        ),
    ]
    rows = [
        AssessmentItemAnalyticsRow(
            item_key=item_key,
            item_label=item_label,
            item_type="workflow",
            population_count=total,
            impacted_count=impacted_count,
            impact_rate=safe_pct(impacted_count, total),
            signal=signal,
            note=note,
        )
        for item_key, item_label, impacted_count, signal, note in definitions
        if impacted_count > 0
    ]
    rows.sort(key=lambda item: priority_by_item_key.get(item.item_key, 999))
    return rows


def _build_cohort_analytics(
    context: AnalyticsContext,
    *,
    eligible_user_ids: set[int],
    learner_rows: list[AssessmentLearnerRow],
    threshold: float | None,
    cohort_filter_ids: set[int] | None,
    awaiting_statuses: set[str],
    returned_statuses: set[str],
    released_statuses: set[str],
) -> list[AssessmentCohortRow]:
    if not context.usergroup_names_by_id:
        return []

    row_by_user = {row.user_id: row for row in learner_rows}
    cohort_rollups: dict[int, _CohortRollupAccumulator] = {}
    for user_id in eligible_user_ids:
        cohort_ids = set(context.cohort_ids_by_user.get(user_id, set()))
        if cohort_filter_ids is not None:
            cohort_ids &= cohort_filter_ids
        if not cohort_ids:
            continue

        learner_row = row_by_user.get(user_id)
        status = learner_row.status if learner_row is not None else None
        submitted = learner_row is not None and (
            learner_row.submitted_at is not None or status not in {None, "DRAFT", "IN_PROGRESS"}
        )
        released = learner_row is not None and status in released_statuses
        returned = learner_row is not None and status in returned_statuses
        awaiting = learner_row is not None and status in awaiting_statuses
        best_score = learner_row.best_score if learner_row is not None else None
        passed = (
            learner_row is not None and best_score is not None and threshold is not None and best_score >= threshold
        )

        for cohort_id in cohort_ids:
            current = cohort_rollups.setdefault(cohort_id, _CohortRollupAccumulator())
            current.eligible_learners += 1
            if submitted:
                current.submitted_learners += 1
            if released:
                current.released_learners += 1
            if awaiting:
                current.awaiting_grading += 1
            if returned:
                current.returned_for_resubmission += 1
            if learner_row is not None:
                current.attempt_total += learner_row.attempts
                current.attempt_learners += 1
            if best_score is not None:
                current.scores.append(best_score)
                current.scored_learners += 1
            if passed:
                current.passers += 1

    rows: list[AssessmentCohortRow] = []
    for cohort_id, values in cohort_rollups.items():
        eligible = values.eligible_learners
        submitted_count = values.submitted_learners
        scored = values.scored_learners
        scores = list(values.scores)
        rows.append(
            AssessmentCohortRow(
                cohort_id=cohort_id,
                cohort_name=context.usergroup_names_by_id.get(cohort_id, f"Cohort {cohort_id}"),
                eligible_learners=eligible,
                submitted_learners=submitted_count,
                submission_rate=safe_pct(submitted_count, eligible),
                pass_rate=safe_pct(values.passers, scored),
                awaiting_grading=values.awaiting_grading,
                returned_for_resubmission=values.returned_for_resubmission,
                released_learners=values.released_learners,
                avg_attempts=round(
                    values.attempt_total / values.attempt_learners,
                    2,
                )
                if values.attempt_learners
                else None,
                median_score=median_or_none(scores),
            )
        )
    rows.sort(
        key=lambda row: (
            row.submission_rate if row.submission_rate is not None else -1,
            row.cohort_name.lower(),
        ),
        reverse=True,
    )
    return rows


def _build_support_diagnostics(
    *,
    assessment_type: str,
    eligible_learners: int,
    learner_rows: list[AssessmentLearnerRow],
    audit_history: list[AssessmentAuditEventRow],
    diagnostics: AssessmentDiagnosticsSnapshot,
    slo: AssessmentSloSnapshot,
    migration: AssessmentMigrationStatus,
    context: AnalyticsContext,
    eligible_user_ids: set[int],
    cohort_filter_ids: set[int] | None,
) -> AssessmentSupportDiagnostics:
    _ = assessment_type
    scoped_cohort_ids: set[int] = set()
    for user_id in eligible_user_ids:
        cohort_ids = set(context.cohort_ids_by_user.get(user_id, set()))
        if cohort_filter_ids is not None:
            cohort_ids &= cohort_filter_ids
        scoped_cohort_ids.update(cohort_ids)

    alerts: list[AssessmentSupportAlertRow] = []
    cutover_blockers: list[str] = []
    if slo.status == "breached":
        alerts.append(
            AssessmentSupportAlertRow(
                code="grading_slo_breached",
                severity="critical",
                summary="Задержка проверки выходит за пределы текущей цели обслуживания.",
            )
        )
    elif slo.status == "warning":
        alerts.append(
            AssessmentSupportAlertRow(
                code="grading_slo_warning",
                severity="warning",
                summary="Задержка проверки приближается к цели обслуживания.",
            )
        )
    if diagnostics.suspicious_attempts > 0:
        alerts.append(
            AssessmentSupportAlertRow(
                code="suspicious_attempts",
                severity="warning",
                summary="Сигналы нарушения целостности были обнаружены в текущем охвате поддержки.",
            )
        )
    if diagnostics.missing_scores > 0:
        alerts.append(
            AssessmentSupportAlertRow(
                code="missing_scores",
                severity="critical",
                summary="В одной или нескольких попытках в охвате отсутствует балл.",
            )
        )
    if not migration.cutover_ready:
        cutover_blockers.append(migration.note)
        alerts.append(
            AssessmentSupportAlertRow(
                code="cutover_blocked",
                severity="warning",
                summary="Чтение совместимости по-прежнему блокирует полный переход на каноническую аналитику.",
            )
        )

    note = (
        "Рекомендуется последующее наблюдение со стороны службы поддержки для активных оповещений и блокировщиков перехода."
        if alerts or cutover_blockers
        else "Диагностика поддержки находится в пределах текущего операционного диапазона."
    )

    return AssessmentSupportDiagnostics(
        analytics_mode="live",
        scoped_eligible_learners=eligible_learners,
        scoped_visible_learners=len(learner_rows),
        scoped_cohort_count=len(scoped_cohort_ids),
        cohort_filter_applied=bool(cohort_filter_ids),
        audit_event_count=len(audit_history),
        cutover_blockers=cutover_blockers,
        alerts=alerts,
        note=note,
    )


def _build_manual_assessment_rows(
    context: AnalyticsContext,
    snapshots: dict[tuple[int, int], ProgressSnapshot],
    allowed_user_ids: set[int] | None,
    bucket_window: tuple[datetime, datetime] | None,
) -> list[AssessmentOutlierRow]:
    eligible_by_course: dict[int, set[int]] = defaultdict(set)
    for course_id, user_id in snapshots:
        eligible_by_course[course_id].add(user_id)

    submissions_by_manual_assessment: dict[int, list] = defaultdict(list)
    for submission, manual_assessment in context.manual_assessment_submissions:
        if not _is_allowed(submission.user_id, allowed_user_ids):
            continue
        if not _in_bucket_window(manual_assessment_submitted_at(submission), bucket_window):
            continue
        if manual_assessment.id is not None:
            submissions_by_manual_assessment[manual_assessment.id].append((
                submission,
                manual_assessment,
            ))

    rows: list[AssessmentOutlierRow] = []
    for manual_assessment in context.manual_assessments:
        manual_assessment_id = manual_assessment.id
        if manual_assessment_id is None:
            continue
        submissions = submissions_by_manual_assessment.get(manual_assessment_id, [])
        eligible = len(eligible_by_course.get(manual_assessment.course_id, set()))
        submitted = len({submission.user_id for submission, _ in submissions})
        graded = [
            submission
            for submission, _ in submissions
            if manual_assessment_is_graded(submission) and manual_assessment_score(submission) is not None
        ]
        grades = [manual_assessment_score(submission) or 0.0 for submission in graded]
        scores_by_user = {submission.user_id: manual_assessment_score(submission) or 0.0 for submission in graded}
        pass_rate = safe_pct(
            sum(1 for submission in graded if (manual_assessment_score(submission) or 0.0) >= 60),
            len(graded),
        )
        variance = _score_variance(grades)
        discrimination = _discrimination_index(scores_by_user)
        latency_hours = [
            value
            for value in (
                hours_between(
                    manual_assessment_submitted_at(submission),
                    manual_assessment_graded_at(submission),
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
        if latency_hours and percentile(latency_hours, 0.9) and percentile(latency_hours, 0.9) > 72:
            outlier_reason_codes.append("grading_latency")

        course = context.courses_by_id[manual_assessment.course_id]
        rows.append(
            AssessmentOutlierRow(
                assessment_type="manual_assessment",
                assessment_id=manual_assessment_id,
                activity_id=manual_assessment.activity_id,
                course_id=manual_assessment.course_id,
                course_name=course.name,
                title=manual_assessment.title,
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
    snapshots: dict[tuple[int, int], ProgressSnapshot],
    allowed_user_ids: set[int] | None,
    bucket_window: tuple[datetime, datetime] | None,
) -> list[AssessmentOutlierRow]:
    eligible_by_course: dict[int, set[int]] = defaultdict(set)
    for course_id, user_id in snapshots:
        eligible_by_course[course_id].add(user_id)

    attempts_by_exam: dict[int, list] = defaultdict(list)
    for attempt, exam in context.exam_attempts:
        if not _is_allowed(attempt.user_id, allowed_user_ids):
            continue
        if not _in_bucket_window(attempt.submitted_at or attempt.started_at, bucket_window):
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
        submitted_users = {attempt.user_id for attempt, _ in attempts if attempt.submitted_at}
        scores = [score for attempt, _ in attempts if (score := manual_assessment_score(attempt)) is not None]
        scores_by_user = {
            attempt.user_id: score for attempt, _ in attempts if (score := manual_assessment_score(attempt)) is not None
        }
        attempts_by_user = Counter(attempt.user_id for attempt, _ in attempts)
        threshold = assessment_pass_threshold(exam.settings)
        pass_rate = safe_pct(sum(1 for score in scores if score >= threshold), len(scores))
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
                avg_attempts=round(sum(attempts_by_user.values()) / len(attempts_by_user), 2)
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
    snapshots: dict[tuple[int, int], ProgressSnapshot],
    allowed_user_ids: set[int] | None,
    bucket_window: tuple[datetime, datetime] | None,
) -> list[AssessmentOutlierRow]:
    eligible_by_course: dict[int, set[int]] = defaultdict(set)
    for course_id, user_id in snapshots:
        eligible_by_course[course_id].add(user_id)

    submissions_by_activity: dict[int, list[tuple[Submission, Activity]]] = defaultdict(list)
    for submission, activity in context.quiz_submissions:
        if not _is_allowed(submission.user_id, allowed_user_ids):
            continue
        if not _in_bucket_window(
            submission.submitted_at or submission.created_at,
            bucket_window,
        ):
            continue
        submissions_by_activity[activity.id].append((submission, activity))

    rows: list[AssessmentOutlierRow] = []
    for activity_id, submissions in submissions_by_activity.items():
        activity = context.activities_by_id.get(activity_id)
        if activity is None or activity.course_id is None:
            continue
        eligible = len(eligible_by_course.get(activity.course_id, set()))
        submitted_users = {
            submission.user_id
            for submission, _ in submissions
            if manual_assessment_submission_status(submission) != SubmissionStatus.DRAFT.value
        }
        scores = [score for submission, _ in submissions if (score := manual_assessment_score(submission)) is not None]
        scores_by_user = {
            submission.user_id: score
            for submission, _ in submissions
            if (score := manual_assessment_score(submission)) is not None
        }
        attempts_by_user = Counter(submission.user_id for submission, _ in submissions)
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
                avg_attempts=round(sum(attempts_by_user.values()) / len(attempts_by_user), 2)
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
    snapshots: dict[tuple[int, int], ProgressSnapshot],
    allowed_user_ids: set[int] | None,
    bucket_window: tuple[datetime, datetime] | None,
) -> list[AssessmentOutlierRow]:
    eligible_by_course: dict[int, set[int]] = defaultdict(set)
    for course_id, user_id in snapshots:
        eligible_by_course[course_id].add(user_id)

    submissions_by_activity: dict[int, list] = defaultdict(list)
    for submission, activity in context.code_submissions:
        if not _is_allowed(submission.user_id, allowed_user_ids):
            continue
        if not _in_bucket_window(getattr(submission, "created_at", None), bucket_window):
            continue
        submissions_by_activity[activity.id].append((submission, activity))

    rows: list[AssessmentOutlierRow] = []
    code_activities = [
        activity
        for activity in context.activities_by_id.values()
        if activity.course_id is not None and activity.activity_type == ActivityTypeEnum.TYPE_CODE_CHALLENGE
    ]
    for activity in code_activities:
        if activity.id is None:
            continue
        activity_id = activity.id
        submissions = submissions_by_activity.get(activity_id, [])
        eligible = len(eligible_by_course.get(activity.course_id, set()))
        submitted_users = {
            submission.user_id for submission, _ in submissions if manual_assessment_is_graded(submission)
        }
        scores = [score for submission, _ in submissions if (score := manual_assessment_score(submission)) is not None]
        scores_by_user = {
            submission.user_id: score
            for submission, _ in submissions
            if (score := manual_assessment_score(submission)) is not None
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
                avg_attempts=round(sum(attempts_by_user.values()) / len(attempts_by_user), 2)
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
        *_build_manual_assessment_rows(context, snapshots, allowed_user_ids, bucket_window),
        *_build_quiz_rows(context, snapshots, allowed_user_ids, bucket_window),
        *_build_exam_rows(context, snapshots, allowed_user_ids, bucket_window),
        *_build_code_rows(context, snapshots, allowed_user_ids, bucket_window),
    ]
    sort_by = filters.sort_by if filters else None
    sort_order = filters.sort_order if filters else "desc"
    sort_map = {
        "title": lambda row: row.title.lower(),
        "submission": lambda row: row.submission_rate if row.submission_rate is not None else -1,
        "pass": lambda row: row.pass_rate if row.pass_rate is not None else -1,
        "difficulty": lambda row: row.difficulty_score if row.difficulty_score is not None else -1,
        "latency": lambda row: row.grading_latency_hours_p90 if row.grading_latency_hours_p90 is not None else -1,
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
            course.id: course for course in db_session.exec(select(Course).where(Course.id.in_(scope.course_ids))).all()
        }
        usergroups = list(db_session.exec(select(UserGroup)).scalars().all())
        return TeacherAssessmentListResponse(
            generated_at=generated_at,
            total=len(rows),
            page=filters.page,
            page_size=filters.page_size,
            items=paged_rows,
            course_options=[
                AnalyticsFilterOption(label=course.name, value=str(course_id))
                for course_id, course in sorted(course_map.items(), key=lambda item: item[1].name.lower())
            ],
            cohort_options=[
                AnalyticsFilterOption(label=group.name, value=str(group.id))
                for group in sorted(usergroups, key=lambda item: item.name.lower())
            ],
        )
    previous_start, _ = filters.previous_window_bounds()
    context = load_analytics_context(db_session, scope.course_ids, activity_start=previous_start)
    rows = build_assessment_rows(context, filters)
    paged_rows = rows[filters.offset : filters.offset + filters.page_size]
    return TeacherAssessmentListResponse(
        generated_at=to_iso(context.generated_at) or "",
        total=len(rows),
        page=filters.page,
        page_size=filters.page_size,
        items=paged_rows,
        course_options=[
            AnalyticsFilterOption(label=context.courses_by_id[course_id].name, value=str(course_id))
            for course_id in sorted(context.courses_by_id)
            if course_id in scope.course_ids
        ],
        cohort_options=[
            AnalyticsFilterOption(label=name, value=str(group_id))
            for group_id, name in sorted(context.usergroup_names_by_id.items(), key=lambda item: item[1].lower())
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
    if assessment_type in {"manual_assessment", "exam"}:
        row = db_session.get(Assessment, assessment_id)
        if row is not None:
            activity = db_session.get(Activity, row.activity_id)
            if activity and activity.course_id in scope.course_ids:
                scoped_course_id = activity.course_id
    else:
        # Quiz and code_challenge assessments are Activity rows with a course_id field
        row = db_session.get(Activity, assessment_id)
        if row and row.course_id in scope.course_ids:
            scoped_course_id = row.course_id

    context_course_ids = [scoped_course_id] if scoped_course_id is not None else scope.course_ids
    context = load_analytics_context(db_session, context_course_ids)
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    snapshots = progress_snapshots(context, allowed_user_ids)
    eligible_by_course: dict[int, set[int]] = defaultdict(set)
    for course_id, user_id in snapshots:
        eligible_by_course[course_id].add(user_id)

    if assessment_type == "manual_assessment":
        manual_assessment = next(
            (item for item in context.manual_assessments if item.id == assessment_id),
            None,
        )
        if manual_assessment is None:
            msg = f"Задание не найдено: {assessment_id}"
            raise ValueError(msg)
        records = [
            (submission, manual_assessment_)
            for submission, manual_assessment_ in context.manual_assessment_submissions
            if manual_assessment_.id == assessment_id and _is_allowed(submission.user_id, allowed_user_ids)
        ]
        eligible = len(eligible_by_course.get(manual_assessment.course_id, set()))
        scores = [
            score
            for submission, _ in records
            if manual_assessment_is_graded(submission)
            for score in [manual_assessment_score(submission)]
            if score is not None
        ]
        latencies = [
            value
            for value in (
                hours_between(
                    manual_assessment_submitted_at(submission),
                    manual_assessment_graded_at(submission),
                )
                for submission, _ in records
            )
            if value is not None
        ]
        attempts_by_user = Counter(submission.user_id for submission, _ in records)
        learner_rows = [
            AssessmentLearnerRow(
                user_id=submission.user_id,
                user_display_name=display_name(context.users_by_id.get(submission.user_id)),
                attempts=1,
                best_score=manual_assessment_score(submission),
                last_score=manual_assessment_score(submission),
                submitted_at=to_iso(manual_assessment_submitted_at(submission)),
                graded_at=to_iso(manual_assessment_graded_at(submission)),
                status=manual_assessment_submission_status(submission),
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
                count=sum(1 for submission, _ in records if manual_assessment_is_reviewable(submission)),
            ),
        ]
        common_failures = [item for item in common_failures if item.count > 0]
        pass_rate = safe_pct(sum(1 for score in scores if score >= 60), len(scores))
        submissions = [submission for submission, _ in records]
        diagnostics = _build_submission_diagnostics(
            submissions,
            manual_grading_required=True,
            note="ManualAssessments use canonical submission states and grading ledger history.",
        )
        audit_history = _load_audit_history(
            db_session,
            activity_id=manual_assessment.activity_id,
            submission_ids=[submission.id for submission in submissions if submission.id is not None],
            allowed_user_ids=allowed_user_ids,
        )
        slo = _build_slo_snapshot(diagnostics, latencies)
        migration = _build_migration_status(
            db_session,
            assessment_type="manual_assessment",
            activity_id=manual_assessment.activity_id,
        )
        eligible_user_ids = eligible_by_course.get(manual_assessment.course_id, set())
        cohort_analytics = _build_cohort_analytics(
            context,
            eligible_user_ids=eligible_user_ids,
            learner_rows=learner_rows,
            threshold=60,
            cohort_filter_ids=set(filters.cohort_ids) if filters.cohort_ids else None,
            awaiting_statuses={SubmissionStatus.PENDING.value},
            returned_statuses={SubmissionStatus.RETURNED.value},
            released_statuses={SubmissionStatus.PUBLISHED.value},
        )
        item_analytics = _build_workflow_item_rows(diagnostics)
        support = _build_support_diagnostics(
            assessment_type="manual_assessment",
            eligible_learners=eligible,
            learner_rows=learner_rows,
            audit_history=audit_history,
            diagnostics=diagnostics,
            slo=slo,
            migration=migration,
            context=context,
            eligible_user_ids=eligible_user_ids,
            cohort_filter_ids=set(filters.cohort_ids) if filters.cohort_ids else None,
        )
        return TeacherAssessmentDetailResponse(
            generated_at=to_iso(context.generated_at) or "",
            assessment_type="manual_assessment",
            assessment_id=assessment_id,
            course_id=manual_assessment.course_id,
            title=manual_assessment.title,
            pass_threshold=60,
            pass_threshold_bucket_label=_score_bucket(60),
            summary=TeacherAssessmentDetailSummary(
                eligible_learners=eligible,
                submitted_learners=len({submission.user_id for submission, _ in records}),
                submission_rate=safe_pct(len({submission.user_id for submission, _ in records}), eligible),
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
            diagnostics=diagnostics,
            audit_history=audit_history,
            slo=slo,
            migration=migration,
            support=support,
            cohort_analytics=cohort_analytics,
            item_analytics=item_analytics,
        )

    if assessment_type == "exam":
        exam = next((item for item in context.exams if item.id == assessment_id), None)
        if exam is None:
            msg = f"Экзамен не найден: {assessment_id}"
            raise ValueError(msg)
        records = [
            (attempt, exam_)
            for attempt, exam_ in context.exam_attempts
            if exam_.id == assessment_id and _is_allowed(attempt.user_id, allowed_user_ids)
        ]
        eligible = len(eligible_by_course.get(exam.course_id, set()))
        exam_attempts_by_user: dict[int, list[Submission]] = defaultdict(list)
        exam_scores: list[float] = []
        for attempt, _exam in records:
            exam_attempts_by_user[attempt.user_id].append(attempt)
            if (score := manual_assessment_score(attempt)) is not None:
                exam_scores.append(score)
        submitted_users = {attempt.user_id for attempt, _exam in records if attempt.submitted_at}
        learner_rows = []
        for user_id, attempts in exam_attempts_by_user.items():
            best_score = max(
                (score for item in attempts if (score := manual_assessment_score(item)) is not None),
                default=None,
            )
            last_attempt = max(attempts, key=lambda item: item.submitted_at or item.started_at or "")
            last_score = manual_assessment_score(last_attempt)
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
        submissions = [attempt for attempt, _exam in records]
        latencies = _submission_latencies(submissions)
        diagnostics = _build_submission_diagnostics(
            submissions,
            manual_grading_required=True,
            note="Exam attempts reuse canonical submission rows, so grading backlog and release state are traceable.",
        )
        audit_history = _load_audit_history(
            db_session,
            activity_id=exam.activity_id,
            submission_ids=[attempt.id for attempt in submissions if attempt.id is not None],
            allowed_user_ids=allowed_user_ids,
        )
        slo = _build_slo_snapshot(diagnostics, latencies)
        migration = _build_migration_status(
            db_session,
            assessment_type="exam",
            activity_id=exam.activity_id,
        )
        eligible_user_ids = eligible_by_course.get(exam.course_id, set())
        cohort_analytics = _build_cohort_analytics(
            context,
            eligible_user_ids=eligible_user_ids,
            learner_rows=learner_rows,
            threshold=threshold,
            cohort_filter_ids=set(filters.cohort_ids) if filters.cohort_ids else None,
            awaiting_statuses={SubmissionStatus.PENDING.value},
            returned_statuses={SubmissionStatus.RETURNED.value},
            released_statuses={SubmissionStatus.PUBLISHED.value},
        )
        item_analytics = _build_workflow_item_rows(diagnostics)
        support = _build_support_diagnostics(
            assessment_type="exam",
            eligible_learners=eligible,
            learner_rows=learner_rows,
            audit_history=audit_history,
            diagnostics=diagnostics,
            slo=slo,
            migration=migration,
            context=context,
            eligible_user_ids=eligible_user_ids,
            cohort_filter_ids=set(filters.cohort_ids) if filters.cohort_ids else None,
        )
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
                    sum(1 for score in exam_scores if score >= threshold),
                    len(exam_scores),
                ),
                median_score=median_or_none(exam_scores),
                avg_attempts=round(
                    sum(len(items) for items in exam_attempts_by_user.values()) / len(exam_attempts_by_user),
                    2,
                )
                if exam_attempts_by_user
                else None,
                grading_latency_hours_p50=None,
                grading_latency_hours_p90=None,
            ),
            score_distribution=_score_distribution(exam_scores),
            attempt_distribution=_attempt_distribution({
                user_id: len(items) for user_id, items in exam_attempts_by_user.items()
            }),
            question_breakdown=None,
            common_failures=[],
            learner_rows=sorted(learner_rows, key=lambda row: row.user_display_name),
            diagnostics=diagnostics,
            audit_history=audit_history,
            slo=slo,
            migration=migration,
            support=support,
            cohort_analytics=cohort_analytics,
            item_analytics=item_analytics,
        )

    if assessment_type == "quiz":
        activity = context.activities_by_id.get(assessment_id)
        if activity is None or activity.course_id is None:
            msg = f"Активность теста не найдена: {assessment_id}"
            raise ValueError(msg)
        records = [
            (submission, activity_)
            for submission, activity_ in context.quiz_submissions
            if activity_.id == assessment_id and _is_allowed(submission.user_id, allowed_user_ids)
        ]
        eligible = len(eligible_by_course.get(activity.course_id, set()))
        quiz_submissions_by_user: dict[int, list[Submission]] = defaultdict(list)
        quiz_scores: list[float] = []
        for submission, _activity in records:
            quiz_submissions_by_user[submission.user_id].append(submission)
            if (score := manual_assessment_score(submission)) is not None:
                quiz_scores.append(score)
        submitted_users = {
            submission.user_id
            for submission, _activity in records
            if manual_assessment_submission_status(submission) != SubmissionStatus.DRAFT.value
        }
        quality_by_question = _quality_by_question_from_quiz_submissions([
            submission for submission, _activity in records
        ])
        question_breakdown = []
        for stat in [item for item in context.quiz_question_stats if item.activity_id == assessment_id]:
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
                    distractor_issue_count=int(quality.get("distractor_issue_count") or 0),
                )
            )
        common_failures = [
            CommonFailureRow(
                key=row.question_id,
                label=row.question_label,
                count=max(0, 100 - int(row.accuracy_pct or 0)),
            )
            for row in sorted(question_breakdown, key=lambda item: item.accuracy_pct or 100)[:5]
            if row.accuracy_pct is not None and row.accuracy_pct < 80
        ]
        learner_rows = []
        for user_id, attempts in quiz_submissions_by_user.items():
            quiz_submission_list: list[Submission] = list(attempts)
            ordered_attempts = sorted(
                quiz_submission_list,
                key=lambda item: item.submitted_at or item.updated_at or item.created_at or item.started_at,
            )
            best_score = max(
                (score for item in quiz_submission_list if (score := manual_assessment_score(item)) is not None),
                default=None,
            )
            last_attempt = ordered_attempts[-1]
            last_score = manual_assessment_score(last_attempt)
            learner_rows.append(
                AssessmentLearnerRow(
                    user_id=user_id,
                    user_display_name=display_name(context.users_by_id.get(user_id)),
                    attempts=len(quiz_submission_list),
                    best_score=round(best_score, 2) if best_score is not None else None,
                    last_score=round(last_score, 2) if last_score is not None else None,
                    submitted_at=to_iso(manual_assessment_submitted_at(last_attempt)),
                    graded_at=to_iso(manual_assessment_graded_at(last_attempt)),
                    status=manual_assessment_submission_status(last_attempt),
                )
            )
        canonical_quiz_submissions = [submission for submission, _activity in records]
        diagnostics = _build_submission_diagnostics(
            canonical_quiz_submissions,
            manual_grading_required=any(
                isinstance(submission.grading_json, dict) and bool(submission.grading_json.get("needs_manual_review"))
                for submission in canonical_quiz_submissions
            ),
            note="Quiz analytics detail is backed by canonical submission rows and per-question grading payloads.",
        )
        audit_history = _load_audit_history(
            db_session,
            activity_id=activity.id,
            submission_ids=[submission.id for submission in canonical_quiz_submissions if submission.id is not None],
            allowed_user_ids=allowed_user_ids,
        )
        latencies = _submission_latencies(canonical_quiz_submissions)
        slo = _build_slo_snapshot(diagnostics, latencies)
        migration = _build_migration_status(
            db_session,
            assessment_type="quiz",
            activity_id=activity.id,
        )
        eligible_user_ids = eligible_by_course.get(activity.course_id, set())
        item_analytics = _build_workflow_item_rows(diagnostics)
        for stat in [item for item in context.quiz_question_stats if item.activity_id == assessment_id]:
            accuracy_pct = safe_pct(stat.correct_count, stat.total_attempts)
            signal = (
                "critical"
                if accuracy_pct is not None and accuracy_pct < 50
                else "watch"
                if accuracy_pct is not None and accuracy_pct < 75
                else "healthy"
            )
            item_analytics.append(
                AssessmentItemAnalyticsRow(
                    item_key=stat.question_id,
                    item_label=f"Вопрос {stat.question_id}",
                    item_type="question",
                    population_count=stat.total_attempts,
                    impacted_count=max(0, stat.total_attempts - stat.correct_count),
                    impact_rate=safe_pct(
                        max(0, stat.total_attempts - stat.correct_count),
                        stat.total_attempts,
                    ),
                    signal=signal,
                    note=(f"Точность {accuracy_pct:.1f}%" if accuracy_pct is not None else "Точность пока недоступна."),
                )
            )

        item_analytics.sort(
            key=lambda item: (
                item.impact_rate if item.impact_rate is not None else -1,
                item.impacted_count,
            ),
            reverse=True,
        )
        cohort_analytics = _build_cohort_analytics(
            context,
            eligible_user_ids=eligible_user_ids,
            learner_rows=learner_rows,
            threshold=60,
            cohort_filter_ids=set(filters.cohort_ids) if filters.cohort_ids else None,
            awaiting_statuses={SubmissionStatus.PENDING.value},
            returned_statuses={SubmissionStatus.RETURNED.value},
            released_statuses={
                SubmissionStatus.GRADED.value,
                SubmissionStatus.PUBLISHED.value,
            },
        )
        support = _build_support_diagnostics(
            assessment_type="quiz",
            eligible_learners=eligible,
            learner_rows=learner_rows,
            audit_history=audit_history,
            diagnostics=diagnostics,
            slo=slo,
            migration=migration,
            context=context,
            eligible_user_ids=eligible_user_ids,
            cohort_filter_ids=set(filters.cohort_ids) if filters.cohort_ids else None,
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
                    sum(1 for score in quiz_scores if score >= 60),
                    len(quiz_scores),
                ),
                median_score=median_or_none(quiz_scores),
                avg_attempts=round(
                    sum(len(items) for items in quiz_submissions_by_user.values()) / len(quiz_submissions_by_user),
                    2,
                )
                if quiz_submissions_by_user
                else None,
                grading_latency_hours_p50=percentile(latencies, 0.5),
                grading_latency_hours_p90=percentile(latencies, 0.9),
            ),
            score_distribution=_score_distribution(quiz_scores),
            attempt_distribution=_attempt_distribution({
                user_id: len(items) for user_id, items in quiz_submissions_by_user.items()
            }),
            question_breakdown=sorted(question_breakdown, key=lambda row: row.accuracy_pct or 100),
            common_failures=common_failures,
            learner_rows=sorted(learner_rows, key=lambda row: row.user_display_name),
            diagnostics=diagnostics,
            audit_history=audit_history,
            slo=slo,
            migration=migration,
            support=support,
            cohort_analytics=cohort_analytics,
            item_analytics=item_analytics,
        )

    if assessment_type == "code_challenge":
        activity = context.activities_by_id.get(assessment_id)
        if activity is None or activity.course_id is None:
            msg = f"Активность задачи по коду не найдена: {assessment_id}"
            raise ValueError(msg)
        records = [
            (submission, activity_)
            for submission, activity_ in context.code_submissions
            if activity_.id == assessment_id and _is_allowed(submission.user_id, allowed_user_ids)
        ]
        eligible = len(eligible_by_course.get(activity.course_id, set()))
        code_attempts_by_user: dict[int, list[Submission]] = defaultdict(list)
        code_scores: list[float] = []
        failure_counter: Counter[str] = Counter()
        for submission, _activity in records:
            code_attempts_by_user[submission.user_id].append(submission)
            score = manual_assessment_score(submission)
            if score is not None:
                code_scores.append(score)
                failed_tests = (
                    (submission.grading_json or {}).get("failed_tests")
                    or (submission.grading_json or {}).get("failed")
                    or []
                )
                for failed in failed_tests:
                    key = str(failed.get("id") if isinstance(failed, dict) else failed)
                    failure_counter[key] += 1
        submitted_users = {
            submission.user_id for submission, _activity in records if manual_assessment_is_graded(submission)
        }
        learner_rows = []
        for user_id, attempts in code_attempts_by_user.items():
            submission_attempts = list(attempts)
            ordered_attempts = sorted(submission_attempts, key=lambda item: item.created_at)
            best_score = max(
                (score for item in submission_attempts if (score := manual_assessment_score(item)) is not None),
                default=None,
            )
            last_attempt = ordered_attempts[-1]
            last_score = manual_assessment_score(last_attempt)
            learner_rows.append(
                AssessmentLearnerRow(
                    user_id=user_id,
                    user_display_name=display_name(context.users_by_id.get(user_id)),
                    attempts=len(submission_attempts),
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
        submissions = [submission for submission, _activity in records]
        latencies = _submission_latencies(submissions)
        diagnostics = _build_submission_diagnostics(
            submissions,
            manual_grading_required=True,
            note="Code challenge detail combines canonical submission state with grading ledger history.",
        )
        audit_history = _load_audit_history(
            db_session,
            activity_id=activity.id,
            submission_ids=[submission.id for submission in submissions if submission.id is not None],
            allowed_user_ids=allowed_user_ids,
        )
        slo = _build_slo_snapshot(diagnostics, latencies)
        migration = _build_migration_status(
            db_session,
            assessment_type="code_challenge",
            activity_id=activity.id,
        )
        eligible_user_ids = eligible_by_course.get(activity.course_id, set())
        item_analytics = _build_workflow_item_rows(diagnostics)
        for key, count in failure_counter.most_common(8):
            item_analytics.append(
                AssessmentItemAnalyticsRow(
                    item_key=key,
                    item_label=f"Failed test {key}",
                    item_type="test",
                    population_count=len(records),
                    impacted_count=count,
                    impact_rate=safe_pct(count, len(records)),
                    signal="critical"
                    if safe_pct(count, len(records)) and safe_pct(count, len(records)) >= 50
                    else "watch",
                    note=f"This test failed in {count} submissions.",
                )
            )
        cohort_analytics = _build_cohort_analytics(
            context,
            eligible_user_ids=eligible_user_ids,
            learner_rows=learner_rows,
            threshold=60,
            cohort_filter_ids=set(filters.cohort_ids) if filters.cohort_ids else None,
            awaiting_statuses={SubmissionStatus.PENDING.value},
            returned_statuses={SubmissionStatus.RETURNED.value},
            released_statuses={SubmissionStatus.PUBLISHED.value},
        )
        support = _build_support_diagnostics(
            assessment_type="code_challenge",
            eligible_learners=eligible,
            learner_rows=learner_rows,
            audit_history=audit_history,
            diagnostics=diagnostics,
            slo=slo,
            migration=migration,
            context=context,
            eligible_user_ids=eligible_user_ids,
            cohort_filter_ids=set(filters.cohort_ids) if filters.cohort_ids else None,
        )
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
                    sum(1 for score in code_scores if score >= 60),
                    len(code_scores),
                ),
                median_score=median_or_none(code_scores),
                avg_attempts=round(
                    sum(len(items) for items in code_attempts_by_user.values()) / len(code_attempts_by_user),
                    2,
                )
                if code_attempts_by_user
                else None,
                grading_latency_hours_p50=None,
                grading_latency_hours_p90=None,
            ),
            score_distribution=_score_distribution(code_scores),
            attempt_distribution=_attempt_distribution({
                user_id: len(items) for user_id, items in code_attempts_by_user.items()
            }),
            question_breakdown=None,
            common_failures=common_failures,
            learner_rows=sorted(learner_rows, key=lambda row: row.user_display_name),
            diagnostics=diagnostics,
            audit_history=audit_history,
            slo=slo,
            migration=migration,
            support=support,
            cohort_analytics=cohort_analytics,
            item_analytics=item_analytics,
        )

    msg = f"Неподдерживаемый тип оценивания: {assessment_type}"
    raise ValueError(msg)
