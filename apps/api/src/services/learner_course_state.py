"""Read-only assembler for the canonical learner course experience."""

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlmodel import Session, col, select

from src.db.courses.activities import Activity
from src.db.courses.certifications import CertificateUser, Certifications
from src.db.courses.chapters import Chapter
from src.db.grading.progress import ActivityProgress, ActivityProgressState, CourseProgress
from src.db.learner_course_state import (
    LearnerActionId,
    LearnerCertificateState,
    LearnerCourseAction,
    LearnerCourseActivityState,
    LearnerCourseChapterState,
    LearnerCoursePermissions,
    LearnerCourseProgressState,
    LearnerCourseState,
    LearnerWorkState,
)
from src.db.trail_runs import TrailRun
from src.db.users import PublicUser
from src.services.courses.access import user_has_course_access
from src.services.courses.courses import _get_course_by_uuid  # pyright: ignore[reportPrivateUsage]

_COMPLETE_STATES = {
    ActivityProgressState.PASSED,
    ActivityProgressState.COMPLETED,
}


def get_learner_course_state(
    course_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> LearnerCourseState:
    course = _get_course_by_uuid(db_session, course_uuid)
    if course is None or course.id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    can_access = user_has_course_access(current_user.id, course, db_session)
    if not can_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Course access is not available")

    chapters = list(
        db_session.exec(
            select(Chapter).where(Chapter.course_id == course.id).order_by(col(Chapter.order), col(Chapter.id))
        ).all()
    )
    activities = list(
        db_session.exec(
            select(Activity)
            .where(Activity.course_id == course.id, Activity.published)
            .order_by(col(Activity.chapter_id), col(Activity.order), col(Activity.id))
        ).all()
    )
    progress_rows = list(
        db_session.exec(
            select(ActivityProgress).where(
                ActivityProgress.course_id == course.id,
                ActivityProgress.user_id == current_user.id,
            )
        ).all()
    )
    progress_by_activity = {row.activity_id: row for row in progress_rows}
    course_progress = db_session.exec(
        select(CourseProgress).where(
            CourseProgress.course_id == course.id,
            CourseProgress.user_id == current_user.id,
        )
    ).first()
    trail_run = db_session.exec(
        select(TrailRun).where(TrailRun.course_id == course.id, TrailRun.user_id == current_user.id)
    ).first()
    enrolled = trail_run is not None or course_progress is not None or bool(progress_rows)

    activity_states = {
        activity.id: _activity_state(activity, progress_by_activity.get(activity.id or -1), course_uuid)
        for activity in activities
        if activity.id is not None
    }
    by_chapter: dict[int, list[LearnerCourseActivityState]] = {}
    for activity in activities:
        if activity.id is not None:
            by_chapter.setdefault(activity.chapter_id, []).append(activity_states[activity.id])
    outline = [
        LearnerCourseChapterState(
            id=chapter.id or 0,
            uuid=chapter.chapter_uuid,
            title=chapter.name,
            index=index,
            activities=by_chapter.get(chapter.id or -1, []),
        )
        for index, chapter in enumerate(chapters)
        if by_chapter.get(chapter.id or -1)
    ]

    progress = _course_progress(course_progress, activity_states.values())
    certificate = _certificate_state(course.id, current_user.id, progress, db_session)
    next_action = _next_action(
        enrolled=enrolled,
        course_uuid=course_uuid,
        activities=list(activity_states.values()),
        certificate=certificate,
        progress=progress,
    )
    enrollment_state = "completed" if progress.progress_pct >= 100 else "in_progress" if enrolled else "not_enrolled"

    return LearnerCourseState(
        course_id=course.id,
        course_uuid=course.course_uuid,
        title=course.name,
        public=course.public,
        enrolled=enrolled,
        enrollment_state=enrollment_state,
        permissions=LearnerCoursePermissions(
            can_discover=course.public,
            can_access=can_access,
            can_enroll=can_access and not enrolled,
        ),
        progress=progress,
        certificate=certificate,
        next_action=next_action,
        outline=outline,
    )


def _activity_state(
    activity: Activity,
    progress: ActivityProgress | None,
    course_uuid: str,
) -> LearnerCourseActivityState:
    state = _product_state(progress.state if progress else None)
    required = progress.required if progress is not None else activity.settings.get("required", True) is not False
    allowed_actions = _allowed_actions(state)
    return LearnerCourseActivityState(
        id=activity.id or 0,
        uuid=activity.activity_uuid,
        title=activity.name,
        type=activity.activity_type.value,
        required=required,
        state=state,
        complete=bool(progress and progress.state in _COMPLETE_STATES),
        score=progress.score if progress else None,
        passed=progress.passed if progress else None,
        due_at=progress.due_at if progress else None,
        is_late=progress.is_late if progress else False,
        allowed_actions=allowed_actions,
    )


def _product_state(state: ActivityProgressState | None) -> LearnerWorkState:
    mapping: dict[ActivityProgressState, LearnerWorkState] = {
        ActivityProgressState.NOT_STARTED: "not_started",
        ActivityProgressState.IN_PROGRESS: "in_progress",
        ActivityProgressState.SUBMITTED: "submitted",
        ActivityProgressState.NEEDS_GRADING: "needs_grading",
        ActivityProgressState.RETURNED: "returned",
        ActivityProgressState.GRADED: "graded_hidden",
        ActivityProgressState.PASSED: "passed",
        ActivityProgressState.FAILED: "failed",
        ActivityProgressState.COMPLETED: "complete",
    }
    return mapping.get(state, "not_started")


def _allowed_actions(state: LearnerWorkState) -> list[str]:
    if state == "returned":
        return ["revise", "view_feedback"]
    if state in {"submitted", "needs_grading", "graded_hidden"}:
        return ["view_receipt"]
    if state in {"passed", "failed", "complete"}:
        return ["view_feedback"]
    if state == "in_progress":
        return ["continue"]
    return ["start"]


def _course_progress(
    persisted: CourseProgress | None,
    activities: Iterable[LearnerCourseActivityState],
) -> LearnerCourseProgressState:
    activity_list = list(activities)
    if persisted is not None:
        return LearnerCourseProgressState(
            completed_required_count=persisted.completed_required_count,
            total_required_count=persisted.total_required_count,
            missing_required_count=persisted.missing_required_count,
            needs_grading_count=persisted.needs_grading_count,
            progress_pct=persisted.progress_pct,
            grade_average=persisted.weighted_grade_average or persisted.grade_average,
            completed_at=persisted.completed_at,
        )

    required = [activity for activity in activity_list if activity.required]
    completed = [activity for activity in required if activity.complete]
    total = len(required)
    return LearnerCourseProgressState(
        completed_required_count=len(completed),
        total_required_count=total,
        missing_required_count=max(0, total - len(completed)),
        needs_grading_count=sum(1 for activity in activity_list if activity.state == "needs_grading"),
        progress_pct=round((len(completed) / total) * 100, 2) if total else 0.0,
    )


def _certificate_state(
    course_id: int,
    user_id: int,
    progress: LearnerCourseProgressState,
    db_session: Session,
) -> LearnerCertificateState:
    certification = db_session.exec(select(Certifications).where(Certifications.course_id == course_id)).first()
    if certification is None or certification.id is None:
        return LearnerCertificateState(configured=False, eligible=False)
    issued = db_session.exec(
        select(CertificateUser).where(
            CertificateUser.certification_id == certification.id,
            CertificateUser.user_id == user_id,
        )
    ).first()
    return LearnerCertificateState(
        configured=True,
        eligible=progress.progress_pct >= 100,
        issued=issued is not None,
        user_certification_uuid=issued.user_certification_uuid if issued else None,
        href=f"/certificates/{issued.user_certification_uuid}/verify" if issued else None,
    )


def _next_action(
    *,
    enrolled: bool,
    course_uuid: str,
    activities: list[LearnerCourseActivityState],
    certificate: LearnerCertificateState,
    progress: LearnerCourseProgressState,
) -> LearnerCourseAction:
    if not enrolled:
        return LearnerCourseAction(id="enroll", label="Start course", reason="not_enrolled", href=f"/course/{course_uuid}")

    returned = next((activity for activity in activities if activity.state == "returned"), None)
    if returned:
        return _activity_action("revise", "Revise returned work", "returned_for_revision", returned, course_uuid)

    now = datetime.now(UTC)
    overdue = next(
        (
            activity
            for activity in activities
            if activity.due_at and activity.due_at < now and not activity.complete and activity.available
        ),
        None,
    )
    if overdue:
        return _activity_action("continue", "Complete overdue work", "overdue", overdue, course_uuid)

    in_progress = next((activity for activity in activities if activity.state == "in_progress"), None)
    if in_progress:
        return _activity_action("continue", "Continue activity", "in_progress", in_progress, course_uuid)

    due_soon_limit = now + timedelta(days=7)
    due_soon = next(
        (
            activity
            for activity in activities
            if activity.required
            and activity.due_at
            and now <= activity.due_at <= due_soon_limit
            and not activity.complete
        ),
        None,
    )
    if due_soon:
        return _activity_action("start", "Start due work", "due_soon", due_soon, course_uuid)

    next_required = next(
        (
            activity
            for activity in activities
            if activity.required and not activity.complete and activity.state not in {"submitted", "needs_grading", "graded_hidden"}
        ),
        None,
    )
    if next_required:
        return _activity_action("start", "Continue course", "next_required", next_required, course_uuid)

    if certificate.issued and certificate.href:
        return LearnerCourseAction(
            id="view_certificate",
            label="View certificate",
            reason="certificate_issued",
            href=certificate.href,
        )
    if progress.progress_pct >= 100:
        return LearnerCourseAction(
            id="review_completion",
            label="Review course completion",
            reason="course_complete",
            href=f"/course/{course_uuid}",
        )
    if any(activity.state in {"submitted", "needs_grading", "graded_hidden"} for activity in activities):
        return LearnerCourseAction(
            id="wait_for_grade",
            label="Waiting for feedback",
            reason="waiting_for_grade",
            enabled=False,
        )
    optional = next((activity for activity in activities if not activity.required and not activity.complete), None)
    if optional:
        return _activity_action("start", "Start optional activity", "optional", optional, course_uuid)
    return LearnerCourseAction(id="none", label="No action available", reason="no_available_action", enabled=False)


def _activity_action(
    action_id: LearnerActionId,
    label: str,
    reason: str,
    activity: LearnerCourseActivityState,
    course_uuid: str,
) -> LearnerCourseAction:
    return LearnerCourseAction(
        id=action_id,
        label=label,
        reason=reason,
        activity_uuid=activity.uuid,
        href=f"/course/{course_uuid}/activity/{activity.uuid}",
    )
