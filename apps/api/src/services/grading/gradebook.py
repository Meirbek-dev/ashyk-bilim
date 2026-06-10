"""Course gradebook matrix built from canonical progress rows."""

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlmodel import Session, col, select

from src.db.courses.activities import Activity, ActivityTypeEnum
from src.db.courses.courses import Course
from src.db.file_submissions import FileSubmissionAttempt
from src.db.grading.gradebook import (
    ActivityProgressCell,
    CourseGradebookResponse,
    GradebookActivity,
    GradebookStudent,
    GradebookSummary,
    TeacherAction,
)
from src.db.grading.progress import (
    ActivityProgress,
    ActivityProgressState,
    AssessmentPolicy,
)
from src.db.grading.submissions import AssessmentType, Submission
from src.db.resource_authors import ResourceAuthor, ResourceAuthorshipStatusEnum
from src.db.trail_runs import TrailRun
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.users import PublicUser, User
from src.security.rbac import PermissionChecker
from src.services.file_submissions import (
    file_submission_attempts_for_gradebook,
    file_submission_configs_for_activities,
)
from src.types import require_persisted_id


async def get_course_gradebook(
    *,
    course_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> CourseGradebookResponse:
    course = _get_course_or_404(course_uuid, db_session)
    _require_gradebook_access(course, current_user, db_session)

    course_id = require_persisted_id(course.id, model_name="Course")
    activities = _course_activities(course_id, db_session)
    students = _course_students(course, activities, db_session)
    student_ids = [require_persisted_id(student.id, model_name="User") for student in students]

    # Optimized progress fetch: only for students in this course view
    progress_rows = db_session.exec(
        select(ActivityProgress).where(
            ActivityProgress.course_id == course_id,
            col(ActivityProgress.user_id).in_(student_ids),
        )
    ).all()
    progress_by_pair = {(r.user_id, r.activity_id): r for r in progress_rows}

    submissions_by_id = _submissions_by_id(
        {progress.latest_submission_id for progress in progress_rows if progress.latest_submission_id},
        db_session,
    )
    activity_ids = {activity.id for activity in activities if activity.id is not None}
    policies_by_activity = _policies_by_activity(activity_ids, db_session)
    file_activity_ids = {
        activity.id
        for activity in activities
        if activity.id is not None and str(activity.activity_type) == ActivityTypeEnum.TYPE_FILE_SUBMISSION.value
    }
    file_attempts_by_pair = file_submission_attempts_for_gradebook(
        file_activity_ids, db_session, student_ids=student_ids
    )
    file_configs_by_activity = file_submission_configs_for_activities(file_activity_ids, db_session)

    cells: list[ActivityProgressCell] = []
    for student in students:
        student_id = require_persisted_id(student.id, model_name="User")
        for activity in activities:
            activity_id = require_persisted_id(activity.id, model_name="Activity")
            progress = progress_by_pair.get((student_id, activity_id))
            latest = (
                submissions_by_id.get(progress.latest_submission_id)
                if progress and progress.latest_submission_id
                else None
            )
            file_attempt = file_attempts_by_pair.get((student_id, activity_id))
            cells.append(
                _build_cell(
                    student_id,
                    activity_id,
                    progress,
                    latest,
                    file_attempt_uuid=file_attempt.attempt_uuid if file_attempt else None,
                    file_attempt_status=str(file_attempt.status) if file_attempt else None,
                )
            )

    activities_payload = [
        _build_activity(
            activity,
            policies_by_activity.get(require_persisted_id(activity.id, model_name="Activity")),
            file_configs_by_activity.get(require_persisted_id(activity.id, model_name="Activity")),
        )
        for activity in activities
    ]
    students_payload = [_build_student(user) for user in students]

    return CourseGradebookResponse(
        course_uuid=course.course_uuid,
        course_id=course_id,
        course_name=course.name,
        students=students_payload,
        activities=activities_payload,
        cells=cells,
        teacher_actions=_build_teacher_actions(
            cells,
            students_payload,
            activities_payload,
        ),
        summary=_build_summary(cells),
    )


def _get_course_or_404(course_uuid: str, db_session: Session) -> Course:
    normalized = course_uuid if course_uuid.startswith("course_") else f"course_{course_uuid}"
    course = db_session.exec(select(Course).where(Course.course_uuid == normalized)).first()
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        )
    return course


def _require_gradebook_access(
    course: Course,
    current_user: PublicUser,
    db_session: Session,
) -> None:
    is_author = db_session.exec(
        select(ResourceAuthor.id).where(
            ResourceAuthor.resource_uuid == course.course_uuid,
            ResourceAuthor.user_id == current_user.id,
            ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
        )
    ).first()
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "course:update",
        resource_owner_id=course.creator_id,
        is_owner=bool(is_author) or course.creator_id == current_user.id,
    )


def _course_activities(course_id: int, db_session: Session) -> list[Activity]:
    return list(
        db_session.exec(
            select(Activity)
            .where(
                Activity.course_id == course_id,
                Activity.published,
            )
            .order_by(col(Activity.chapter_id), col(Activity.order), col(Activity.id))
        ).all()
    )


def _course_students(
    course: Course,
    activities: list[Activity],
    db_session: Session,
) -> list[User]:
    activity_ids = [activity.id for activity in activities if activity.id is not None]

    from sqlmodel import exists, or_

    user_group_exists = exists().where(
        col(UserGroupUser.user_id) == User.id,
        col(UserGroupUser.usergroup_id) == UserGroupResource.usergroup_id,
        col(UserGroupResource.resource_uuid) == course.course_uuid,
    )
    trail_run_exists = exists().where(
        col(TrailRun.user_id) == User.id,
        col(TrailRun.course_id) == course.id,
    )

    conditions = [user_group_exists, trail_run_exists]

    if activity_ids:
        submission_exists = exists().where(
            col(Submission.user_id) == User.id,
            col(Submission.activity_id).in_(activity_ids),
        )
        file_attempt_exists = exists().where(
            col(FileSubmissionAttempt.user_id) == User.id,
            col(FileSubmissionAttempt.activity_id).in_(activity_ids),
        )
        progress_exists = exists().where(
            col(ActivityProgress.user_id) == User.id,
            col(ActivityProgress.activity_id).in_(activity_ids),
        )
        conditions.extend([submission_exists, file_attempt_exists, progress_exists])

    return list(
        db_session.exec(
            select(User).where(or_(*conditions)).order_by(col(User.last_name), col(User.first_name), col(User.username))
        ).all()
    )


def _progress_by_pair(
    course_id: int,
    db_session: Session,
) -> dict[tuple[int, int], ActivityProgress]:
    rows = db_session.exec(select(ActivityProgress).where(ActivityProgress.course_id == course_id)).all()
    return {(row.user_id, row.activity_id): row for row in rows}


def _submissions_by_id(
    submission_ids: set[int | None],
    db_session: Session,
) -> dict[int, Submission]:
    ids = {submission_id for submission_id in submission_ids if submission_id}
    if not ids:
        return {}
    submissions = db_session.exec(select(Submission).where(col(Submission.id).in_(ids))).all()
    return {submission.id: submission for submission in submissions if submission.id}


def _policies_by_activity(activity_ids: set[int], db_session: Session) -> dict[int, AssessmentPolicy]:
    if not activity_ids:
        return {}
    policies = db_session.exec(
        select(AssessmentPolicy).where(col(AssessmentPolicy.activity_id).in_(activity_ids))
    ).all()
    return {policy.activity_id: policy for policy in policies}


def _build_student(user: User) -> GradebookStudent:
    return GradebookStudent(
        id=require_persisted_id(user.id, model_name="User"),
        user_uuid=user.user_uuid,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        email=str(user.email),
    )


def _build_activity(
    activity: Activity,
    policy: AssessmentPolicy | None,
    file_config: object | None = None,
) -> GradebookActivity:
    return GradebookActivity(
        id=require_persisted_id(activity.id, model_name="Activity"),
        activity_uuid=activity.activity_uuid,
        name=activity.name,
        activity_type=str(activity.activity_type),
        assessment_type=_gradebook_assessment_type(policy),
        order=activity.order,
        due_at=getattr(file_config, "due_at", None) if file_config else policy.due_at if policy else None,
    )


def _gradebook_assessment_type(
    policy: AssessmentPolicy | None,
) -> AssessmentType | None:
    if policy is None:
        return None

    try:
        return AssessmentType(policy.assessment_type)
    except ValueError:
        return None


def _build_cell(
    user_id: int,
    activity_id: int,
    progress: ActivityProgress | None,
    latest: Submission | None,
    *,
    file_attempt_uuid: str | None = None,
    file_attempt_status: str | None = None,
) -> ActivityProgressCell:
    if progress is None:
        return ActivityProgressCell(
            user_id=user_id,
            activity_id=activity_id,
            state=ActivityProgressState.NOT_STARTED,
        )

    return ActivityProgressCell(
        user_id=user_id,
        activity_id=activity_id,
        state=ActivityProgressState(progress.state),
        score=progress.score,
        passed=progress.passed,
        is_late=progress.is_late,
        teacher_action_required=progress.teacher_action_required,
        attempt_count=progress.attempt_count,
        latest_submission_uuid=latest.submission_uuid if latest else file_attempt_uuid,
        latest_submission_status=str(latest.status) if latest else file_attempt_status,
        submitted_at=progress.submitted_at,
        graded_at=progress.graded_at,
        completed_at=progress.completed_at,
        due_at=progress.due_at,
        status_reason=progress.status_reason,
    )


def _build_teacher_actions(
    cells: list[ActivityProgressCell],
    students: list[GradebookStudent],
    activities: list[GradebookActivity],
) -> list[TeacherAction]:
    students_by_id = {student.id: student for student in students}
    activities_by_id = {activity.id: activity for activity in activities}
    actions: list[TeacherAction] = []
    for cell in cells:
        if not cell.teacher_action_required or not cell.latest_submission_uuid:
            continue
        student = students_by_id.get(cell.user_id)
        activity = activities_by_id.get(cell.activity_id)
        if student is None or activity is None:
            continue
        student_name = f"{student.first_name or ''} {student.last_name or ''}".strip() or student.username
        actions.append(
            TeacherAction(
                action_type="GRADE_SUBMISSION",
                user_id=cell.user_id,
                activity_id=cell.activity_id,
                submission_uuid=cell.latest_submission_uuid,
                student_name=student_name,
                activity_name=activity.name,
                submitted_at=cell.submitted_at,
                is_late=cell.is_late,
            )
        )
    return actions


def _build_summary(cells: list[ActivityProgressCell]) -> GradebookSummary:
    now = datetime.now(UTC)
    overdue_count = sum(
        1
        for cell in cells
        if (due_at := _coerce_datetime(cell.due_at)) is not None
        and due_at < now
        and cell.state not in {ActivityProgressState.COMPLETED, ActivityProgressState.PASSED}
    )
    return GradebookSummary(
        student_count=len({cell.user_id for cell in cells}),
        activity_count=len({cell.activity_id for cell in cells}),
        needs_grading_count=sum(1 for cell in cells if cell.teacher_action_required),
        overdue_count=overdue_count,
        not_started_count=sum(1 for cell in cells if cell.state == ActivityProgressState.NOT_STARTED),
        completed_count=sum(
            1 for cell in cells if cell.state in {ActivityProgressState.COMPLETED, ActivityProgressState.PASSED}
        ),
    )


def _coerce_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)
