"""Course gradebook matrix built from canonical progress rows."""

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from src.db.courses.activities import Activity
from src.db.courses.courses import Course
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
from src.db.grading.submissions import Submission
from src.db.resource_authors import ResourceAuthor, ResourceAuthorshipStatusEnum
from src.db.trail_runs import TrailRun
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.users import PublicUser, User
from src.security.rbac import PermissionChecker
from src.services.progress.submissions import backfill_activity_progress


async def get_course_gradebook(
    *,
    course_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> CourseGradebookResponse:
    course = _get_course_or_404(course_uuid, db_session)
    _require_gradebook_access(course, current_user, db_session)

    try:
        backfill_activity_progress(db_session, course_id=course.id, commit=True)
    except IntegrityError:
        db_session.rollback()

    activities = _course_activities(course.id, db_session)
    students = _course_students(course, activities, db_session)
    progress_by_pair = _progress_by_pair(course.id, db_session)
    submissions_by_id = _submissions_by_id(
        {progress.latest_submission_id for progress in progress_by_pair.values()},
        db_session,
    )
    policies_by_activity = _policies_by_activity(db_session)

    cells: list[ActivityProgressCell] = []
    for student in students:
        for activity in activities:
            progress = progress_by_pair.get((student.id, activity.id))
            latest = (
                submissions_by_id.get(progress.latest_submission_id)
                if progress and progress.latest_submission_id
                else None
            )
            cells.append(_build_cell(student.id, activity.id, progress, latest))

    activities_payload = [
        _build_activity(activity, policies_by_activity.get(activity.id))
        for activity in activities
    ]
    students_payload = [_build_student(user) for user in students]

    return CourseGradebookResponse(
        course_uuid=course.course_uuid,
        course_id=course.id,
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
    normalized = (
        course_uuid if course_uuid.startswith("course_") else f"course_{course_uuid}"
    )
    course = db_session.exec(
        select(Course).where(Course.course_uuid == normalized)
    ).first()
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
                Activity.published == True,
            )
            .order_by(Activity.chapter_id, Activity.order, Activity.id)
        ).all()
    )


def _course_students(
    course: Course,
    activities: list[Activity],
    db_session: Session,
) -> list[User]:
    activity_ids = [activity.id for activity in activities if activity.id is not None]
    user_ids: set[int] = set()

    for row in db_session.exec(
        select(UserGroupUser.user_id)
        .join(
            UserGroupResource,
            UserGroupResource.usergroup_id == UserGroupUser.usergroup_id,
        )
        .where(UserGroupResource.resource_uuid == course.course_uuid)
    ).all():
        user_ids.add(row)

    for row in db_session.exec(
        select(TrailRun.user_id).where(TrailRun.course_id == course.id)
    ).all():
        user_ids.add(row)

    if activity_ids:
        for row in db_session.exec(
            select(Submission.user_id).where(Submission.activity_id.in_(activity_ids))
        ).all():
            user_ids.add(row)

        for row in db_session.exec(
            select(ActivityProgress.user_id).where(
                ActivityProgress.activity_id.in_(activity_ids)
            )
        ).all():
            user_ids.add(row)

    if not user_ids:
        return []

    return list(
        db_session.exec(
            select(User)
            .where(User.id.in_(user_ids))
            .order_by(User.last_name, User.first_name, User.username)
        ).all()
    )


def _progress_by_pair(
    course_id: int,
    db_session: Session,
) -> dict[tuple[int, int], ActivityProgress]:
    rows = db_session.exec(
        select(ActivityProgress).where(ActivityProgress.course_id == course_id)
    ).all()
    return {(row.user_id, row.activity_id): row for row in rows}


def _submissions_by_id(
    submission_ids: set[int | None],
    db_session: Session,
) -> dict[int, Submission]:
    ids = {submission_id for submission_id in submission_ids if submission_id}
    if not ids:
        return {}
    submissions = db_session.exec(
        select(Submission).where(Submission.id.in_(ids))
    ).all()
    return {submission.id: submission for submission in submissions if submission.id}


def _policies_by_activity(db_session: Session) -> dict[int, AssessmentPolicy]:
    policies = db_session.exec(select(AssessmentPolicy)).all()
    return {policy.activity_id: policy for policy in policies}


def _build_student(user: User) -> GradebookStudent:
    return GradebookStudent(
        id=user.id,
        user_uuid=user.user_uuid,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        email=str(user.email),
    )


def _build_activity(
    activity: Activity,
    policy: AssessmentPolicy | None,
) -> GradebookActivity:
    return GradebookActivity(
        id=activity.id,
        activity_uuid=activity.activity_uuid,
        name=activity.name,
        activity_type=str(activity.activity_type),
        assessment_type=policy.assessment_type if policy else None,
        order=activity.order,
        due_at=policy.due_at if policy else None,
    )


def _build_cell(
    user_id: int,
    activity_id: int,
    progress: ActivityProgress | None,
    latest: Submission | None,
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
        state=progress.state,
        score=progress.score,
        passed=progress.passed,
        is_late=progress.is_late,
        teacher_action_required=progress.teacher_action_required,
        attempt_count=progress.attempt_count,
        latest_submission_uuid=latest.submission_uuid if latest else None,
        latest_submission_status=str(latest.status) if latest else None,
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
        student_name = (
            f"{student.first_name or ''} {student.last_name or ''}".strip()
            or student.username
        )
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
        and cell.state
        not in {ActivityProgressState.COMPLETED, ActivityProgressState.PASSED}
    )
    return GradebookSummary(
        student_count=len({cell.user_id for cell in cells}),
        activity_count=len({cell.activity_id for cell in cells}),
        needs_grading_count=sum(1 for cell in cells if cell.teacher_action_required),
        overdue_count=overdue_count,
        not_started_count=sum(
            1 for cell in cells if cell.state == ActivityProgressState.NOT_STARTED
        ),
        completed_count=sum(
            1
            for cell in cells
            if cell.state
            in {ActivityProgressState.COMPLETED, ActivityProgressState.PASSED}
        ),
    )


def _coerce_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)
