from __future__ import annotations

from fastapi import HTTPException, status
from sqlmodel import Session

from src.db.ai_remediation import AIRemediationSession
from src.db.ai_runtime import AIRun, AIThread, AIThreadRole
from src.db.courses.activities import Activity
from src.db.courses.courses import Course
from src.db.grading.submissions import Submission
from src.db.users import PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses._auth import check_course_action, require_course_permission, require_course_read_access


def _course_for_activity(db_session: Session, activity_id: int) -> Course:
    activity = db_session.get(Activity, activity_id)
    if activity is None or activity.course_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Активность не найдена")
    course = db_session.get(Course, activity.course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Курс не найден")
    return course


def can_update_course(db_session: Session, course: Course, user: PublicUser) -> bool:
    return check_course_action("course:update", user, course, PermissionChecker(db_session))


def require_ai_course_read(db_session: Session, course: Course, user: PublicUser) -> None:
    require_course_read_access(user, course, PermissionChecker(db_session))


def require_ai_course_update(db_session: Session, course: Course, user: PublicUser) -> None:
    require_course_permission("course:update", user, course, PermissionChecker(db_session))


def derive_course_ai_role(db_session: Session, course: Course, user: PublicUser) -> str:
    if can_update_course(db_session, course, user):
        return AIThreadRole.TEACHER.value
    require_ai_course_read(db_session, course, user)
    return AIThreadRole.STUDENT.value


def require_ai_submission_access(db_session: Session, submission: Submission, user: PublicUser) -> Course:
    if submission.user_id == user.id:
        return _course_for_activity(db_session, submission.activity_id)

    course = _course_for_activity(db_session, submission.activity_id)
    require_ai_course_update(db_session, course, user)
    return course


def require_ai_remediation_access(
    db_session: Session,
    session: AIRemediationSession,
    user: PublicUser,
) -> None:
    if session.student_user_id == user.id:
        return

    submission = db_session.get(Submission, session.submission_id)
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Решение не найдено")
    require_ai_submission_access(db_session, submission, user)


def require_ai_run_access(db_session: Session, run: AIRun, user: PublicUser) -> None:
    thread = db_session.get(AIThread, run.thread_id)
    if thread is not None and thread.user_id == user.id:
        return
    PermissionChecker(db_session).require(user.id, "platform:read")


def require_ai_admin(user: PublicUser, db_session: Session) -> None:
    PermissionChecker(db_session).require(user.id, "platform:read")
