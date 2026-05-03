"""Canonical submission-to-progress projection.

This module is intentionally idempotent.  It can be called after any write path
or run as a repair/backfill job to rebuild `activity_progress` and
`course_progress` from the current submission state.
"""

from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select
from ulid import ULID

from src.db.assessments import Assessment
from src.db.courses.activities import Activity, ActivityTypeEnum
from src.db.courses.blocks import Block, BlockTypeEnum
from src.db.courses.courses import Course
from src.db.courses.quiz import QuizAttempt
from src.db.grading.progress import (
    ActivityProgress,
    ActivityProgressState,
    AssessmentCompletionRule,
    AssessmentGradingMode,
    AssessmentPolicy,
    CourseProgress,
)
from src.db.grading.submissions import (
    AssessmentType,
    Submission,
    SubmissionStatus,
)
from src.db.trail_runs import TrailRun
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser

_ASSESSMENT_TYPE_BY_ACTIVITY_TYPE: dict[str, AssessmentType] = {
    ActivityTypeEnum.TYPE_ASSIGNMENT.value: AssessmentType.ASSIGNMENT,
    ActivityTypeEnum.TYPE_EXAM.value: AssessmentType.EXAM,
    ActivityTypeEnum.TYPE_CODE_CHALLENGE.value: AssessmentType.CODE_CHALLENGE,
}

DEFAULT_ANTI_CHEAT_JSON: dict[str, object] = {
    "copy_paste_protection": False,
    "tab_switch_detection": False,
    "devtools_detection": False,
    "right_click_disable": False,
    "fullscreen_enforcement": False,
    "violation_threshold": None,
}


def start_activity_submission(submission: Submission, db_session: Session) -> None:
    _record_submission_change(submission, db_session)


def save_activity_draft(submission: Submission, db_session: Session) -> None:
    _record_submission_change(submission, db_session)


def submit_activity(submission: Submission, db_session: Session) -> None:
    _record_submission_change(submission, db_session)


def grade_submission(submission: Submission, db_session: Session) -> None:
    _record_submission_change(submission, db_session)


def return_submission(submission: Submission, db_session: Session) -> None:
    _record_submission_change(submission, db_session)


def publish_grade(submission: Submission, db_session: Session) -> None:
    _record_submission_change(submission, db_session)


def recalculate_activity_progress(
    activity_id: int,
    user_id: int,
    db_session: Session,
    *,
    commit: bool = True,
    update_course_progress: bool = True,
) -> ActivityProgress | None:
    activity = db_session.get(Activity, activity_id)
    if activity is None or activity.course_id is None:
        return None

    policy = _get_or_create_policy(activity, db_session)
    submissions = list(
        db_session.exec(
            select(Submission).where(
                Submission.activity_id == activity_id,
                Submission.user_id == user_id,
            )
        ).all()
    )
    progress = db_session.exec(
        select(ActivityProgress).where(
            ActivityProgress.activity_id == activity_id,
            ActivityProgress.user_id == user_id,
        )
    ).first()
    if progress is None:
        progress = ActivityProgress(
            course_id=activity.course_id,
            activity_id=activity_id,
            user_id=user_id,
        )

    _apply_progress_from_submissions(progress, policy, submissions)
    db_session.add(progress)

    if update_course_progress:
        recalculate_course_progress(
            activity.course_id,
            user_id,
            db_session,
            commit=False,
        )

    if commit:
        db_session.commit()
        db_session.refresh(progress)
    return progress


def recalculate_course_progress(
    course_id: int,
    user_id: int,
    db_session: Session,
    *,
    commit: bool = True,
) -> CourseProgress:
    _ensure_course_activity_progress_rows(course_id, user_id, db_session)
    rows = list(
        db_session.exec(
            select(ActivityProgress).where(
                ActivityProgress.course_id == course_id,
                ActivityProgress.user_id == user_id,
                ActivityProgress.required,
            )
        ).all()
    )
    total = len(rows)
    completed = [row for row in rows if _progress_is_completed(row)]
    scored = [row.score for row in rows if row.score is not None]
    needs_grading = sum(1 for row in rows if row.teacher_action_required)
    last_activity_at = max(
        (ts for row in rows for ts in [row.last_activity_at] if ts is not None),
        default=None,
    )
    all_completed = bool(total) and len(completed) >= total
    completed_at = (
        max(
            (ts for row in rows for ts in [row.completed_at] if ts is not None),
            default=None,
        )
        if all_completed
        else None
    )

    # ── Weighted grade average ────────────────────────────────────────────────
    # Fetch assessment weights for all activities that have scores.
    scored_activity_ids = [row.activity_id for row in rows if row.score is not None]
    weight_by_activity: dict[int, float] = {}
    if scored_activity_ids:
        assessment_rows = db_session.exec(
            select(Assessment.activity_id, Assessment.weight).where(
                Assessment.activity_id.in_(scored_activity_ids)
            )
        ).all()
        weight_by_activity = {
            row.activity_id: float(row.weight) for row in assessment_rows
        }

    weighted_numerator = 0.0
    weighted_denominator = 0.0
    for row in rows:
        if row.score is None:
            continue
        w = weight_by_activity.get(row.activity_id, 1.0)
        if w == 0.0:
            continue  # zero-weight activities are excluded from the average
        weighted_numerator += row.score * w
        weighted_denominator += w
    weighted_grade_average = (
        round(weighted_numerator / weighted_denominator, 2)
        if weighted_denominator
        else None
    )

    progress = db_session.exec(
        select(CourseProgress).where(
            CourseProgress.course_id == course_id,
            CourseProgress.user_id == user_id,
        )
    ).first()
    if progress is None:
        progress = CourseProgress(course_id=course_id, user_id=user_id)

    progress.completed_required_count = len(completed)
    progress.total_required_count = total
    progress.progress_pct = round((len(completed) / total) * 100, 2) if total else 0
    progress.grade_average = round(sum(scored) / len(scored), 2) if scored else None
    progress.weighted_grade_average = weighted_grade_average
    progress.missing_required_count = max(0, total - len(completed))
    progress.needs_grading_count = needs_grading
    progress.last_activity_at = last_activity_at
    progress.completed_at = completed_at
    progress.certificate_eligible = all_completed
    progress.updated_at = datetime.now(UTC)

    db_session.add(progress)
    if commit:
        db_session.commit()
        db_session.refresh(progress)
    return progress


def _ensure_course_activity_progress_rows(
    course_id: int,
    user_id: int,
    db_session: Session,
) -> None:
    activities = [
        activity
        for activity in db_session.exec(
            select(Activity).where(
                Activity.course_id == course_id,
                Activity.published,
            )
        ).all()
        if activity.id is not None
    ]
    if not activities:
        return

    existing_activity_ids = set(
        db_session.exec(
            select(ActivityProgress.activity_id).where(
                ActivityProgress.course_id == course_id,
                ActivityProgress.user_id == user_id,
            )
        ).all()
    )
    now = datetime.now(UTC)
    for activity in activities:
        if activity.id in existing_activity_ids:
            continue
        policy = _get_or_create_policy(activity, db_session)
        db_session.add(
            ActivityProgress(
                course_id=course_id,
                activity_id=activity.id,
                user_id=user_id,
                required=True,
                due_at=_coerce_datetime(policy.due_at) if policy else None,
                updated_at=now,
            )
        )


def backfill_activity_progress(
    db_session: Session,
    *,
    course_id: int | None = None,
    commit: bool = True,
) -> dict[str, int]:
    """Repair canonical progress rows for known enrolled/interacting learners."""

    activity_query = select(Activity).where(Activity.published)
    if course_id is not None:
        activity_query = activity_query.where(Activity.course_id == course_id)
    activities = [
        activity
        for activity in db_session.exec(activity_query).all()
        if activity.course_id is not None
    ]

    user_ids_by_course = _known_user_ids_by_course(db_session, activities)

    rows = 0
    for activity in activities:
        assert activity.course_id is not None
        _get_or_create_policy(activity, db_session)
        for user_id in user_ids_by_course.get(activity.course_id, set()):
            recalculate_activity_progress(
                activity.id,
                user_id,
                db_session,
                commit=False,
                update_course_progress=False,
            )
            rows += 1

    db_session.flush()
    for repaired_course_id, user_ids in user_ids_by_course.items():
        for user_id in user_ids:
            recalculate_course_progress(
                repaired_course_id,
                user_id,
                db_session,
                commit=False,
            )

    if commit:
        db_session.commit()
    return {"activities": len(activities), "progress_rows_repaired": rows}


def sync_quiz_attempt(
    attempt: QuizAttempt,
    db_session: Session,
    *,
    commit: bool = True,
) -> Submission:
    manual_review = any(
        isinstance(item, dict) and item.get("needs_grading")
        for item in (attempt.grading_result or {}).get("per_question", [])
    )
    status = SubmissionStatus.PENDING if manual_review else SubmissionStatus.GRADED
    submission = _get_or_create_progress_submission(
        submission_uuid=f"submission_{attempt.attempt_uuid}",
        activity_id=attempt.activity_id,
        user_id=attempt.user_id,
        assessment_type=AssessmentType.QUIZ,
        db_session=db_session,
    )
    submission.attempt_number = attempt.attempt_number
    submission.status = status
    submission.answers_json = attempt.answers or {}
    submission.grading_json = _quiz_grading_json(attempt)
    submission.metadata_json = submission.metadata_json or {}
    submission.auto_score = float(attempt.score or 0)
    submission.final_score = None if manual_review else float(attempt.score or 0)
    submission.is_late = False
    submission.started_at = _coerce_datetime(attempt.start_ts)
    submission.submitted_at = _coerce_datetime(attempt.end_ts)
    submission.graded_at = None if manual_review else _coerce_datetime(attempt.end_ts)
    submission.created_at = _coerce_datetime(attempt.creation_date) or datetime.now(UTC)
    submission.updated_at = _coerce_datetime(attempt.update_date) or datetime.now(UTC)

    _save_progress_submission(submission, db_session, commit=commit)
    return submission


def _record_submission_change(submission: Submission, db_session: Session) -> None:
    _attach_policy(submission, db_session)
    db_session.add(submission)
    recalculate_activity_progress(
        submission.activity_id,
        submission.user_id,
        db_session,
        commit=False,
    )
    db_session.commit()
    db_session.refresh(submission)


def _save_progress_submission(
    submission: Submission,
    db_session: Session,
    *,
    commit: bool,
) -> None:
    _attach_policy(submission, db_session)
    db_session.add(submission)
    recalculate_activity_progress(
        submission.activity_id,
        submission.user_id,
        db_session,
        commit=False,
    )
    if commit:
        db_session.commit()
        db_session.refresh(submission)


def _apply_progress_from_submissions(
    progress: ActivityProgress,
    policy: AssessmentPolicy | None,
    submissions: list[Submission],
) -> None:
    now = datetime.now(UTC)
    latest = max(submissions, key=_submission_sort_key, default=None)
    submitted_attempts = [
        submission
        for submission in submissions
        if _enum_value(submission.status) != SubmissionStatus.DRAFT.value
    ]
    best = max(
        (
            submission
            for submission in submitted_attempts
            if _submission_score(submission) is not None
        ),
        key=lambda submission: _submission_score(submission) or 0,
        default=None,
    )
    passing_score = _policy_passing_score(policy)

    state = ActivityProgressState.NOT_STARTED
    score = None
    passed = None
    completed_at = None
    teacher_action = False
    status_reason = None

    if latest is not None:
        latest_status = _enum_value(latest.status)
        score = _submission_score(best or latest)
        passed = score is not None and score >= passing_score
        if latest_status == SubmissionStatus.DRAFT.value:
            state = ActivityProgressState.IN_PROGRESS
        elif latest_status == SubmissionStatus.RETURNED.value:
            state = ActivityProgressState.RETURNED
            status_reason = "returned_for_revision"
        elif latest_status == SubmissionStatus.PENDING.value:
            if _policy_grading_mode(policy) == AssessmentGradingMode.MANUAL.value:
                state = ActivityProgressState.NEEDS_GRADING
                teacher_action = True
            else:
                state = ActivityProgressState.SUBMITTED
        elif latest_status in {
            SubmissionStatus.GRADED.value,
            SubmissionStatus.PUBLISHED.value,
        }:
            if score is None:
                state = ActivityProgressState.GRADED
            elif passed:
                state = ActivityProgressState.PASSED
            else:
                state = ActivityProgressState.FAILED

        if _completion_satisfied(policy, latest, score):
            completed_at = (
                _coerce_datetime(latest.graded_at)
                or _coerce_datetime(latest.submitted_at)
                or _coerce_datetime(latest.updated_at)
                or now
            )
            if _policy_completion_rule(policy) in {
                AssessmentCompletionRule.SUBMITTED.value,
                AssessmentCompletionRule.VIEWED.value,
                AssessmentCompletionRule.TEACHER_VERIFIED.value,
            }:
                state = ActivityProgressState.COMPLETED

    progress.state = state
    progress.required = True
    progress.score = score
    progress.passed = passed
    progress.best_submission_id = best.id if best else None
    progress.latest_submission_id = latest.id if latest else None
    progress.attempt_count = len(submitted_attempts)
    progress.started_at = _coerce_datetime(latest.started_at) if latest else None
    progress.last_activity_at = _latest_timestamp(submissions)
    progress.submitted_at = _coerce_datetime(latest.submitted_at) if latest else None
    progress.graded_at = _coerce_datetime(latest.graded_at) if latest else None
    progress.completed_at = completed_at
    progress.due_at = _coerce_datetime(policy.due_at) if policy else None
    progress.is_late = bool(latest.is_late) if latest else False
    progress.teacher_action_required = teacher_action
    progress.status_reason = status_reason
    progress.updated_at = now


def _completion_satisfied(
    policy: AssessmentPolicy | None,
    submission: Submission,
    score: float | None,
) -> bool:
    rule = _policy_completion_rule(policy)
    status = _enum_value(submission.status)
    if rule == AssessmentCompletionRule.SUBMITTED.value:
        return status != SubmissionStatus.DRAFT.value
    if rule == AssessmentCompletionRule.GRADED.value:
        return status in {
            SubmissionStatus.GRADED.value,
            SubmissionStatus.PUBLISHED.value,
        }
    if rule == AssessmentCompletionRule.PASSED.value:
        return (
            status in {SubmissionStatus.GRADED.value, SubmissionStatus.PUBLISHED.value}
            and score is not None
            and score >= _policy_passing_score(policy)
        )
    return False


def _progress_is_completed(progress: ActivityProgress) -> bool:
    return progress.completed_at is not None or _enum_value(progress.state) in {
        ActivityProgressState.COMPLETED.value,
        ActivityProgressState.PASSED.value,
    }


def _get_or_create_policy(
    activity: Activity,
    db_session: Session,
    assessment_type: AssessmentType | None = None,
) -> AssessmentPolicy | None:
    policy = db_session.exec(
        select(AssessmentPolicy).where(AssessmentPolicy.activity_id == activity.id)
    ).first()
    if policy is not None:
        return policy

    assessment_type = assessment_type or _assessment_type_for_activity(
        activity, db_session
    )
    if assessment_type is None:
        return None

    grading_mode = (
        AssessmentGradingMode.MANUAL
        if assessment_type == AssessmentType.ASSIGNMENT
        else AssessmentGradingMode.AUTO_THEN_MANUAL
        if assessment_type in {AssessmentType.QUIZ, AssessmentType.EXAM}
        else AssessmentGradingMode.AUTO
    )
    completion_rule = (
        AssessmentCompletionRule.GRADED
        if assessment_type == AssessmentType.ASSIGNMENT
        else AssessmentCompletionRule.PASSED
    )
    settings_json: dict[str, object] = {}
    anti_cheat_json = DEFAULT_ANTI_CHEAT_JSON.copy()
    if assessment_type == AssessmentType.QUIZ:
        quiz_block = db_session.exec(
            select(Block).where(
                Block.activity_id == activity.id,
                Block.block_type == BlockTypeEnum.BLOCK_QUIZ,
            )
        ).first()
        if quiz_block is not None:
            content = quiz_block.content if isinstance(quiz_block.content, dict) else {}
            raw_settings = content.get("settings")
            settings_json = raw_settings if isinstance(raw_settings, dict) else {}
            anti_cheat_json = anti_cheat_from_quiz_settings(settings_json)

    policy = AssessmentPolicy(
        policy_uuid=f"policy_{ULID()}",
        activity_id=activity.id,
        assessment_type=assessment_type,
        grading_mode=grading_mode,
        completion_rule=completion_rule,
        passing_score=60,
        anti_cheat_json=anti_cheat_json,
        settings_json=settings_json,
    )
    db_session.add(policy)
    db_session.flush()
    return policy


def anti_cheat_from_quiz_settings(settings: dict[str, object]) -> dict[str, object]:
    track_violations = settings.get("track_violations") is True
    return {
        "copy_paste_protection": settings.get("prevent_copy") is True,
        "tab_switch_detection": track_violations,
        "devtools_detection": False,
        "right_click_disable": False,
        "fullscreen_enforcement": False,
        "violation_threshold": (
            _positive_int_setting(settings, "max_violations")
            if track_violations and settings.get("block_on_violations") is True
            else None
        ),
    }


def _positive_int_setting(settings: dict[str, object], key: str) -> int | None:
    value = settings.get(key)
    if value is None:
        return None
    try:
        parsed = int(value)
    except TypeError, ValueError:
        return None
    return parsed if parsed > 0 else None


def _number_setting(settings: dict[str, object], key: str, default: float) -> float:
    value = settings.get(key)
    if value is None:
        return default
    try:
        return float(value)
    except TypeError, ValueError:
        return default


def _assessment_type_for_activity(
    activity: Activity,
    db_session: Session,
) -> AssessmentType | None:
    value = _enum_value(activity.activity_type)
    if value in _ASSESSMENT_TYPE_BY_ACTIVITY_TYPE:
        return _ASSESSMENT_TYPE_BY_ACTIVITY_TYPE[value]
    quiz_block = db_session.exec(
        select(Block.id).where(
            Block.activity_id == activity.id,
            Block.block_type == BlockTypeEnum.BLOCK_QUIZ,
        )
    ).first()
    return AssessmentType.QUIZ if quiz_block is not None else None


def _attach_policy(submission: Submission, db_session: Session) -> None:
    if submission.assessment_policy_id is not None:
        return
    activity = db_session.get(Activity, submission.activity_id)
    if activity is None:
        return
    policy = _get_or_create_policy(
        activity,
        db_session,
        assessment_type=submission.assessment_type,
    )
    if policy is not None:
        submission.assessment_policy_id = policy.id


def _get_or_create_progress_submission(
    *,
    submission_uuid: str,
    activity_id: int,
    user_id: int,
    assessment_type: AssessmentType,
    db_session: Session,
) -> Submission:
    existing = db_session.exec(
        select(Submission).where(Submission.submission_uuid == submission_uuid)
    ).first()
    if existing is not None:
        return existing
    now = datetime.now(UTC)
    return Submission(
        submission_uuid=submission_uuid,
        assessment_type=assessment_type,
        activity_id=activity_id,
        user_id=user_id,
        status=SubmissionStatus.DRAFT,
        attempt_number=1,
        answers_json={},
        grading_json={},
        started_at=now,
        created_at=now,
        updated_at=now,
    )


def _known_user_ids_by_course(
    db_session: Session,
    activities: list[Activity],
) -> dict[int, set[int]]:
    course_ids = {activity.course_id for activity in activities if activity.course_id}
    activity_ids = {activity.id for activity in activities if activity.id is not None}
    result: dict[int, set[int]] = {course_id: set() for course_id in course_ids}

    for row in db_session.exec(select(TrailRun.course_id, TrailRun.user_id)).all():
        if row.course_id in result:
            result[row.course_id].add(row.user_id)

    activity_course = {activity.id: activity.course_id for activity in activities}
    for row in db_session.exec(
        select(Submission.activity_id, Submission.user_id).where(
            Submission.activity_id.in_(activity_ids)
        )
    ).all():
        course_id = activity_course.get(row.activity_id)
        if course_id in result:
            result[course_id].add(row.user_id)

    course_uuid_to_id = {
        course.course_uuid: course.id
        for course in db_session.exec(
            select(Course).where(Course.id.in_(course_ids))
        ).all()
    }
    for row in db_session.exec(
        select(UserGroupResource.resource_uuid, UserGroupUser.user_id).join(
            UserGroupUser,
            UserGroupUser.usergroup_id == UserGroupResource.usergroup_id,
        )
    ).all():
        course_id = course_uuid_to_id.get(row.resource_uuid)
        if course_id in result:
            result[course_id].add(row.user_id)

    return result


def _policy_grading_mode(policy: AssessmentPolicy | None) -> str:
    if policy is None:
        return AssessmentGradingMode.AUTO_THEN_MANUAL.value
    return _enum_value(policy.grading_mode)


def _policy_completion_rule(policy: AssessmentPolicy | None) -> str:
    if policy is None:
        return AssessmentCompletionRule.SUBMITTED.value
    return _enum_value(policy.completion_rule)


def _policy_passing_score(policy: AssessmentPolicy | None) -> float:
    return float(policy.passing_score) if policy is not None else 60.0


def _quiz_grading_json(attempt: QuizAttempt) -> dict[str, Any]:
    return {
        "items": [
            {
                "item_id": str(item.get("question_id", "")),
                "item_text": str(item.get("question_text", "")),
                "score": float(item.get("score") or 0),
                "max_score": float(item.get("max_score") or 0),
                "correct": item.get("correct"),
                "feedback": str(item.get("feedback", "")),
                "needs_manual_review": bool(item.get("needs_grading", False)),
                "user_answer": item.get("user_answer"),
                "correct_answer": item.get("correct_answers"),
            }
            for item in (attempt.grading_result or {}).get("per_question", [])
            if isinstance(item, dict)
        ],
        "needs_manual_review": any(
            isinstance(item, dict) and item.get("needs_grading")
            for item in (attempt.grading_result or {}).get("per_question", [])
        ),
        "auto_graded": True,
        "feedback": "",
    }


def _submission_score(submission: Submission) -> float | None:
    if submission.final_score is not None:
        return float(submission.final_score)
    if submission.auto_score is not None:
        return float(submission.auto_score)
    return None


def _submission_sort_key(submission: Submission) -> tuple[datetime, int]:
    timestamp = (
        _coerce_datetime(submission.submitted_at)
        or _coerce_datetime(submission.updated_at)
        or _coerce_datetime(submission.created_at)
        or _coerce_datetime(submission.started_at)
        or datetime.min.replace(tzinfo=UTC)
    )
    return timestamp, submission.id or 0


def _latest_timestamp(submissions: list[Submission]) -> datetime | None:
    if not submissions:
        return None
    return _submission_sort_key(max(submissions, key=_submission_sort_key))[0]


def _coerce_datetime(value: object) -> datetime | None:
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


def _enum_value(value: object) -> str:
    return str(getattr(value, "value", value))
