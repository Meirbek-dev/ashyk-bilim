"""Canonical learner and teacher work queue assembler."""

import base64
import binascii
import json
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, col, or_, select

from src.db.courses.activities import Activity
from src.db.courses.courses import Course
from src.db.file_submissions import FileSubmissionAttempt, FileSubmissionAttemptStatus
from src.db.grading.progress import ActivityProgress, ActivityProgressState
from src.db.grading.submissions import Submission, SubmissionStatus
from src.db.resource_authors import ResourceAuthor, ResourceAuthorshipStatusEnum
from src.db.users import PublicUser, User
from src.db.work_queue import WorkItem, WorkQueueResponse, WorkRole

_LEARNER_OPEN_STATES = {
    ActivityProgressState.IN_PROGRESS,
    ActivityProgressState.SUBMITTED,
    ActivityProgressState.NEEDS_GRADING,
    ActivityProgressState.RETURNED,
    ActivityProgressState.PASSED,
    ActivityProgressState.FAILED,
}


def get_work_queue(
    current_user: PublicUser,
    db_session: Session,
    *,
    role: WorkRole,
    limit: int = 50,
    cursor: str | None = None,
) -> WorkQueueResponse:
    items = (
        _learner_work(current_user, db_session)
        if role == "learner"
        else _teacher_work(current_user, db_session)
    )
    ordered = sorted(items, key=_sort_key)
    if cursor:
        cursor_key = _decode_cursor(cursor)
        ordered = [item for item in ordered if _serializable_sort_key(item) > cursor_key]
    page = ordered[:limit]
    next_cursor = _encode_cursor(page[-1]) if len(ordered) > limit and page else None
    return WorkQueueResponse(items=page, total=len(items), next_cursor=next_cursor)


def _learner_work(current_user: PublicUser, db_session: Session) -> list[WorkItem]:
    rows = db_session.exec(
        select(ActivityProgress, Activity, Course)
        .join(Activity, col(Activity.id) == ActivityProgress.activity_id)
        .join(Course, col(Course.id) == ActivityProgress.course_id)
        .where(
            ActivityProgress.user_id == current_user.id,
            col(ActivityProgress.state).in_(_LEARNER_OPEN_STATES),
            Activity.published,
        )
    ).all()
    now = datetime.now(UTC)
    return [_learner_item(progress, activity, course, now) for progress, activity, course in rows]


def _learner_item(
    progress: ActivityProgress,
    activity: Activity,
    course: Course,
    now: datetime,
) -> WorkItem:
    href = f"/course/{course.course_uuid}/activity/{activity.activity_uuid}"
    if progress.state == ActivityProgressState.RETURNED:
        return WorkItem(
            id=f"learner-returned-{progress.id}",
            role="learner",
            kind="returned_for_revision",
            status="returned",
            priority="critical",
            title=f"Revise {activity.name}",
            description=f"{course.name}: feedback requires a new submission.",
            href=href,
            primary_action="Revise work",
            course_uuid=course.course_uuid,
            course_title=course.name,
            activity_uuid=activity.activity_uuid,
            activity_title=activity.name,
            due_at=progress.due_at,
            created_at=progress.updated_at,
            allowed_actions=["revise", "view_feedback"],
        )
    if progress.state in {ActivityProgressState.SUBMITTED, ActivityProgressState.NEEDS_GRADING}:
        return WorkItem(
            id=f"learner-waiting-{progress.id}",
            role="learner",
            kind="waiting_for_grade",
            status="needs_grading",
            priority="low",
            title=f"Waiting for feedback on {activity.name}",
            description=f"{course.name}: your work was received.",
            href=href,
            primary_action="View receipt",
            course_uuid=course.course_uuid,
            course_title=course.name,
            activity_uuid=activity.activity_uuid,
            activity_title=activity.name,
            due_at=progress.due_at,
            created_at=progress.submitted_at or progress.updated_at,
            allowed_actions=["view_receipt"],
        )
    if progress.state in {ActivityProgressState.PASSED, ActivityProgressState.FAILED}:
        return WorkItem(
            id=f"learner-feedback-{progress.id}",
            role="learner",
            kind="feedback_released",
            status="published",
            priority="high" if progress.state == ActivityProgressState.FAILED else "normal",
            title=f"Review feedback for {activity.name}",
            description=f"{course.name}: a grading decision is available.",
            href=href,
            primary_action="View feedback",
            course_uuid=course.course_uuid,
            course_title=course.name,
            activity_uuid=activity.activity_uuid,
            activity_title=activity.name,
            due_at=progress.due_at,
            created_at=progress.graded_at or progress.updated_at,
            allowed_actions=["view_feedback"],
        )

    overdue = progress.due_at is not None and _as_utc(progress.due_at) < now
    return WorkItem(
        id=f"learner-progress-{progress.id}",
        role="learner",
        kind="overdue" if overdue else "in_progress",
        status="in_progress",
        priority="critical" if overdue else "high",
        title=f"Continue {activity.name}",
        description=f"{course.name}: finish your in-progress work.",
        href=href,
        primary_action="Continue",
        course_uuid=course.course_uuid,
        course_title=course.name,
        activity_uuid=activity.activity_uuid,
        activity_title=activity.name,
        due_at=progress.due_at,
        created_at=progress.started_at or progress.updated_at,
        allowed_actions=["continue"],
    )


def _teacher_work(current_user: PublicUser, db_session: Session) -> list[WorkItem]:
    is_active_author = (
        select(ResourceAuthor.id)
        .where(
            ResourceAuthor.resource_uuid == Course.course_uuid,
            ResourceAuthor.user_id == current_user.id,
            ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
        )
        .exists()
    )
    rows = db_session.exec(
        select(ActivityProgress, Activity, Course, User)
        .join(Activity, col(Activity.id) == ActivityProgress.activity_id)
        .join(Course, col(Course.id) == ActivityProgress.course_id)
        .join(User, col(User.id) == ActivityProgress.user_id)
        .where(
            ActivityProgress.teacher_action_required,
            or_(Course.creator_id == current_user.id, is_active_author),
        )
    ).all()
    now = datetime.now(UTC)
    items: list[WorkItem] = []
    for progress, activity, course, learner in rows:
        submitted_at = progress.submitted_at or progress.updated_at
        age = now - _as_utc(submitted_at) if submitted_at else timedelta(0)
        priority = "critical" if age >= timedelta(days=3) else "high"
        learner_name = " ".join(part for part in [learner.first_name, learner.last_name] if part).strip()
        submission_uuid = _review_submission_uuid(progress, activity, db_session, awaiting_release=False)
        items.append(
            WorkItem(
                id=f"teacher-grade-{progress.id}",
                role="teacher",
                kind="sla_breach" if priority == "critical" else "needs_grading",
                status="needs_grading",
                priority=priority,
                title=f"Grade {activity.name}",
                description=f"{learner_name or learner.username} submitted work in {course.name}.",
                href=_review_href(course, activity, submission_uuid),
                primary_action="Grade submission",
                course_uuid=course.course_uuid,
                course_title=course.name,
                activity_uuid=activity.activity_uuid,
                activity_title=activity.name,
                due_at=progress.due_at,
                created_at=submitted_at,
                allowed_actions=["grade", "return", "publish"],
            )
        )
    items.extend(_awaiting_release_work(current_user, db_session, is_active_author))
    return items


def _awaiting_release_work(
    current_user: PublicUser,
    db_session: Session,
    is_active_author: object,
) -> list[WorkItem]:
    rows = db_session.exec(
        select(ActivityProgress, Activity, Course, User)
        .join(Activity, col(Activity.id) == ActivityProgress.activity_id)
        .join(Course, col(Course.id) == ActivityProgress.course_id)
        .join(User, col(User.id) == ActivityProgress.user_id)
        .where(
            ActivityProgress.state == ActivityProgressState.GRADED,
            or_(Course.creator_id == current_user.id, is_active_author),
        )
    ).all()
    items: list[WorkItem] = []
    for progress, activity, course, learner in rows:
        submission_uuid = _review_submission_uuid(progress, activity, db_session, awaiting_release=True)
        if submission_uuid is None:
            continue
        learner_name = " ".join(part for part in [learner.first_name, learner.last_name] if part).strip()
        items.append(
            WorkItem(
                id=f"teacher-release-{progress.id}",
                role="teacher",
                kind="awaiting_release",
                status="graded_hidden",
                priority="high",
                title=f"Release {activity.name}",
                description=f"{learner_name or learner.username}'s grade in {course.name} is saved but not visible.",
                href=_review_href(course, activity, submission_uuid),
                primary_action="Review and release",
                course_uuid=course.course_uuid,
                course_title=course.name,
                activity_uuid=activity.activity_uuid,
                activity_title=activity.name,
                created_at=progress.graded_at or progress.updated_at,
                allowed_actions=["review", "publish"],
            )
        )
    return items


def _review_submission_uuid(
    progress: ActivityProgress,
    activity: Activity,
    db_session: Session,
    *,
    awaiting_release: bool,
) -> str | None:
    if progress.latest_submission_id is not None:
        submission = db_session.get(Submission, progress.latest_submission_id)
        if submission is not None and (
            not awaiting_release
            or str(getattr(submission.status, "value", submission.status)) == SubmissionStatus.GRADED.value
        ):
            return submission.submission_uuid

    expected_status = (
        FileSubmissionAttemptStatus.GRADED
        if awaiting_release
        else FileSubmissionAttemptStatus.SUBMITTED
    )
    attempt = db_session.exec(
        select(FileSubmissionAttempt)
        .where(
            FileSubmissionAttempt.activity_id == activity.id,
            FileSubmissionAttempt.user_id == progress.user_id,
            FileSubmissionAttempt.status == expected_status,
        )
        .order_by(col(FileSubmissionAttempt.updated_at).desc())
    ).first()
    return attempt.attempt_uuid if attempt else None


def _review_href(course: Course, activity: Activity, submission_uuid: str | None) -> str:
    base = f"/dash/courses/{course.course_uuid}/activity/{activity.activity_uuid}/review"
    return f"{base}?submission={submission_uuid}" if submission_uuid else base


def _sort_key(item: WorkItem) -> tuple[int, datetime, str]:
    rank = {"critical": 0, "high": 1, "normal": 2, "low": 3}
    due = _as_utc(item.due_at or item.created_at) if item.due_at or item.created_at else datetime.max.replace(tzinfo=UTC)
    return rank[item.priority], due, item.id


def _serializable_sort_key(item: WorkItem) -> tuple[int, str, str]:
    priority, due, item_id = _sort_key(item)
    return priority, due.isoformat(), item_id


def _encode_cursor(item: WorkItem) -> str:
    payload = json.dumps(_serializable_sort_key(item), separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[int, str, str]:
    try:
        padding = "=" * (-len(cursor) % 4)
        value = json.loads(base64.urlsafe_b64decode(cursor + padding))
        if (
            not isinstance(value, list)
            or len(value) != 3
            or not isinstance(value[0], int)
            or not isinstance(value[1], str)
            or not isinstance(value[2], str)
        ):
            raise ValueError
        return value[0], value[1], value[2]
    except (ValueError, TypeError, binascii.Error, json.JSONDecodeError) as exc:
        raise ValueError("Invalid work queue cursor") from exc


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
