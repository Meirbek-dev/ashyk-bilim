"""Canonical student activity runtime service."""

from __future__ import annotations

from fastapi import HTTPException, Request, status
from sqlmodel import Session, col, select

from src.db.assessments import Assessment
from src.db.courses.activities import Activity, ActivityTypeEnum
from src.db.courses.chapters import Chapter
from src.db.file_submissions import FileSubmissionActivity
from src.db.grading.progress import (
    ActivityProgress,
    ActivityProgressState,
    AssessmentPolicy,
)
from src.db.grading.submissions import Submission
from src.db.student_activity_runtime import (
    StudentActivityActionRequest,
    StudentActivityContentRuntime,
    StudentActivityCourseHeader,
    StudentActivityHeader,
    StudentActivityNavItem,
    StudentActivityOutlineChapter,
    StudentActivityPermissions,
    StudentActivityProgressRuntime,
    StudentActivityRuntime,
    StudentActivityState,
    StudentPrimaryAction,
    StudentVisiblePolicy,
)
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses.courses import _get_course_by_uuid  # pyright: ignore[reportPrivateUsage]
from src.services.progress.submissions import (
    mark_manual_activity_complete,
    recalculate_course_progress,
    unmark_manual_activity_complete,
)
from src.services.trail.trail import add_activity_to_trail, remove_activity_from_trail


async def get_student_activity_runtime(
    request: Request,
    course_uuid: str,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> StudentActivityRuntime:
    course = _get_course_by_uuid(db_session, course_uuid)
    if course is None or course.id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    activity = _get_activity_for_course(course.id, activity_uuid, db_session)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Активность не найдена")

    checker = PermissionChecker(db_session)
    is_authenticated = not isinstance(current_user, AnonymousUser)
    can_update = (
        is_authenticated
        and activity.creator_id is not None
        and checker.check(current_user.id, "activity:update", resource_owner_id=activity.creator_id)
    )
    can_view = bool(course.public and activity.published) or can_update
    if not can_view:
        checker.require(current_user.id, "activity:read", resource_owner_id=activity.creator_id)
        can_view = True

    chapters = _get_course_chapters(course.id, db_session)
    activities_by_chapter = _get_course_activities(course.id, db_session)
    progress_by_activity = _get_progress_by_activity(course.id, current_user, db_session)
    outline = _build_outline(chapters, activities_by_chapter, progress_by_activity)
    flat_items = [item for chapter in outline for item in chapter.activities]
    current_index = next((idx for idx, item in enumerate(flat_items) if item.id == activity.id), -1)
    previous_item = flat_items[current_index - 1] if current_index > 0 else None
    next_item = flat_items[current_index + 1] if 0 <= current_index < len(flat_items) - 1 else None

    progress = _build_progress(progress_by_activity.get(activity.id) if activity.id is not None else None, db_session)
    policy = _get_visible_policy(activity, db_session)
    content = _build_content(activity, db_session) if can_view else None
    permissions = StudentActivityPermissions(
        is_authenticated=is_authenticated,
        can_view=can_view,
        can_update=can_update,
    )

    return StudentActivityRuntime(
        course=StudentActivityCourseHeader(
            id=course.id,
            uuid=course.course_uuid,
            title=course.name,
            public=course.public,
        ),
        activity=StudentActivityHeader(
            id=activity.id or 0,
            uuid=activity.activity_uuid,
            title=activity.name,
            type=_enum_value(activity.activity_type) or "",
            subtype=_enum_value(activity.activity_sub_type) or "",
            published=activity.published,
            chapter_id=activity.chapter_id,
            chapter_title=next(
                (chapter.name for chapter in chapters if chapter.id == activity.chapter_id),
                None,
            ),
            order=activity.order,
        ),
        content=content,
        outline=outline,
        progress=progress,
        policy=policy,
        permissions=permissions,
        primary_action=_derive_primary_action(
            activity=activity,
            can_view=can_view,
            is_authenticated=is_authenticated,
            next_item=next_item,
            progress=progress,
        ),
        previous=previous_item,
        next=next_item,
    )


async def run_student_activity_action(
    request: Request,
    course_uuid: str,
    activity_uuid: str,
    action: StudentActivityActionRequest,
    current_user: PublicUser,
    db_session: Session,
) -> StudentActivityRuntime:
    course = _get_course_by_uuid(db_session, course_uuid)
    if course is None or course.id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    activity = _get_activity_for_course(course.id, activity_uuid, db_session)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Активность не найдена")

    if action.command == "mark_complete":
        await add_activity_to_trail(request, current_user, activity.activity_uuid, db_session)
        if activity.id is not None:
            mark_manual_activity_complete(activity.id, current_user.id, db_session, commit=True)
    elif action.command == "unmark_complete":
        await remove_activity_from_trail(request, current_user, activity.activity_uuid, db_session)
        if activity.id is not None:
            unmark_manual_activity_complete(activity.id, current_user.id, db_session, commit=True)
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Command '{action.command}' is owned by the activity-specific runtime.",
        )

    return await get_student_activity_runtime(request, course_uuid, activity_uuid, current_user, db_session)


def _get_activity_for_course(course_id: int, activity_uuid: str, db_session: Session) -> Activity | None:
    candidates = _activity_uuid_candidates(activity_uuid)
    return db_session.exec(
        select(Activity).where(Activity.course_id == course_id, col(Activity.activity_uuid).in_(candidates))
    ).first()


def _activity_uuid_candidates(activity_uuid: str) -> tuple[str, ...]:
    value = activity_uuid.strip()
    if value.startswith("activity_"):
        raw = value.removeprefix("activity_")
        return (value, raw) if raw else (value,)
    return (f"activity_{value}", value)


def _get_course_chapters(course_id: int, db_session: Session) -> list[Chapter]:
    return list(
        db_session.exec(select(Chapter).where(Chapter.course_id == course_id).order_by(col(Chapter.order), col(Chapter.id))).all()
    )


def _get_course_activities(course_id: int, db_session: Session) -> dict[int, list[Activity]]:
    rows = list(
        db_session.exec(
            select(Activity)
            .where(Activity.course_id == course_id)
            .order_by(col(Activity.chapter_id), col(Activity.order), col(Activity.id))
        ).all()
    )
    by_chapter: dict[int, list[Activity]] = {}
    for activity in rows:
        by_chapter.setdefault(activity.chapter_id, []).append(activity)
    return by_chapter


def _get_progress_by_activity(
    course_id: int,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[int, ActivityProgress]:
    if isinstance(current_user, AnonymousUser):
        return {}
    recalculate_course_progress(course_id, current_user.id, db_session, commit=True)
    rows = db_session.exec(
        select(ActivityProgress).where(
            ActivityProgress.course_id == course_id,
            ActivityProgress.user_id == current_user.id,
        )
    ).all()
    return {row.activity_id: row for row in rows}


def _build_outline(
    chapters: list[Chapter],
    activities_by_chapter: dict[int, list[Activity]],
    progress_by_activity: dict[int, ActivityProgress],
) -> list[StudentActivityOutlineChapter]:
    return [
        StudentActivityOutlineChapter(
            id=chapter.id or 0,
            title=chapter.name,
            index=index,
            activities=[
                _nav_item(activity, progress_by_activity.get(activity.id or -1))
                for activity in activities_by_chapter.get(chapter.id or -1, [])
                if activity.id is not None
            ],
        )
        for index, chapter in enumerate(chapters)
    ]


def _nav_item(activity: Activity, progress: ActivityProgress | None) -> StudentActivityNavItem:
    runtime_progress = _build_progress(progress)
    return StudentActivityNavItem(
        id=activity.id or 0,
        uuid=activity.activity_uuid,
        title=activity.name,
        type=_enum_value(activity.activity_type) or "",
        published=activity.published,
        complete=runtime_progress.complete,
        state=runtime_progress.state,
    )


def _build_progress(
    progress: ActivityProgress | None, db_session: Session | None = None
) -> StudentActivityProgressRuntime:
    if progress is None:
        return StudentActivityProgressRuntime(state="not_started")

    latest_submission = (
        db_session.get(Submission, progress.latest_submission_id)
        if db_session is not None and progress.latest_submission_id is not None
        else None
    )
    state_value = _progress_state_value(progress.state)
    return StudentActivityProgressRuntime(
        state=_normalize_state(progress),
        canonical_state=ActivityProgressState(progress.state),
        complete=bool(progress.completed_at) or state_value in {"PASSED", "COMPLETED"},
        score=progress.score,
        passed=progress.passed,
        due_at=progress.due_at,
        is_late=progress.is_late,
        teacher_action_required=progress.teacher_action_required,
        attempt_count=progress.attempt_count,
        latest_submission_uuid=getattr(latest_submission, "submission_uuid", None),
        latest_submission_status=_enum_value(getattr(latest_submission, "status", None)),
        submitted_at=progress.submitted_at,
        graded_at=progress.graded_at,
        completed_at=progress.completed_at,
        status_reason=progress.status_reason,
    )


def _normalize_state(progress: ActivityProgress) -> StudentActivityState:
    state = _progress_state_value(progress.state)
    if progress.completed_at is not None and state in {
        "NOT_STARTED",
        "IN_PROGRESS",
        "COMPLETED",
    }:
        return "complete"
    mapping: dict[str, StudentActivityState] = {
        "NOT_STARTED": "not_started",
        "IN_PROGRESS": "in_progress",
        "SUBMITTED": "submitted",
        "NEEDS_GRADING": "needs_grading",
        "RETURNED": "returned",
        "GRADED": "graded_hidden",
        "PASSED": "passed",
        "FAILED": "failed",
        "COMPLETED": "complete",
    }
    return mapping.get(state, "not_started")


def _progress_state_value(state: object) -> str:
    return _enum_value(state) or "NOT_STARTED"


def _enum_value(value: object) -> str | None:
    if value is None:
        return None
    return str(getattr(value, "value", value))


def _get_visible_policy(activity: Activity, db_session: Session) -> StudentVisiblePolicy | None:
    if activity.id is None:
        return None
    policy = db_session.exec(select(AssessmentPolicy).where(AssessmentPolicy.activity_id == activity.id)).first()
    if policy is not None:
        return StudentVisiblePolicy(
            due_at=policy.due_at,
            max_attempts=policy.max_attempts,
            passing_score=policy.passing_score,
            grade_release_mode=_enum_value(policy.grade_release_mode),
            grading_mode=_enum_value(policy.grading_mode),
            completion_rule=_enum_value(policy.completion_rule),
            time_limit_seconds=policy.time_limit_seconds,
        )
    file_submission = db_session.exec(
        select(FileSubmissionActivity).where(FileSubmissionActivity.activity_id == activity.id)
    ).first()
    if file_submission is None:
        return None
    return StudentVisiblePolicy(
        due_at=file_submission.due_at,
        max_attempts=file_submission.max_attempts,
        grade_release_mode=file_submission.grade_release_mode,
    )


def _build_content(activity: Activity, db_session: Session) -> StudentActivityContentRuntime:
    assessment_uuid = None
    if activity.id is not None and activity.activity_type in {
        ActivityTypeEnum.TYPE_EXAM,
        ActivityTypeEnum.TYPE_CODE_CHALLENGE,
        ActivityTypeEnum.TYPE_CUSTOM,
    }:
        assessment = db_session.exec(select(Assessment).where(Assessment.activity_id == activity.id)).first()
        assessment_uuid = assessment.assessment_uuid if assessment else None

    file_submission_uuid = None
    if activity.id is not None and activity.activity_type == ActivityTypeEnum.TYPE_FILE_SUBMISSION:
        file_submission = db_session.exec(
            select(FileSubmissionActivity).where(FileSubmissionActivity.activity_id == activity.id)
        ).first()
        file_submission_uuid = file_submission.file_submission_uuid if file_submission else None

    return StudentActivityContentRuntime(
        type=_enum_value(activity.activity_type) or "",
        subtype=_enum_value(activity.activity_sub_type) or "",
        content=activity.content or {},
        details=activity.details or {},
        settings=activity.settings or {},
        assessment_uuid=assessment_uuid,
        file_submission_uuid=file_submission_uuid,
    )


def _derive_primary_action(
    *,
    activity: Activity,
    can_view: bool,
    is_authenticated: bool,
    next_item: StudentActivityNavItem | None,
    progress: StudentActivityProgressRuntime,
) -> StudentPrimaryAction:
    if not can_view:
        return StudentPrimaryAction(id="none", enabled=False, reason="unavailable")
    if progress.state == "returned":
        return StudentPrimaryAction(id="revise", enabled=True)
    if progress.state in {"published", "passed", "failed"}:
        return StudentPrimaryAction(id="view_feedback", enabled=True)
    if progress.state in {"submitted", "needs_grading"}:
        return StudentPrimaryAction(id="view_receipt", enabled=True)
    if progress.state == "graded_hidden":
        return StudentPrimaryAction(id="review_policy", enabled=True)
    if activity.activity_type in {
        ActivityTypeEnum.TYPE_EXAM,
        ActivityTypeEnum.TYPE_CODE_CHALLENGE,
        ActivityTypeEnum.TYPE_CUSTOM,
        ActivityTypeEnum.TYPE_FILE_SUBMISSION,
    }:
        return StudentPrimaryAction(id="continue" if progress.state == "in_progress" else "start", enabled=True)
    if progress.complete and next_item is not None:
        return StudentPrimaryAction(id="next_activity", enabled=True, target_activity_uuid=next_item.uuid)
    if not is_authenticated:
        return StudentPrimaryAction(id="none", enabled=False, reason="authentication_required")
    return StudentPrimaryAction(id="unmark_complete" if progress.complete else "mark_complete", enabled=True)
