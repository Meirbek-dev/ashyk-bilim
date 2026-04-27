import logging
from datetime import UTC, datetime, time

from fastapi import HTTPException, Request, UploadFile
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.assignments import (
    Assignment,
    AssignmentCreate,
    AssignmentCreateWithActivity,
    AssignmentDraftPatch,
    AssignmentDraftRead,
    AssignmentRead,
    AssignmentTask,
    AssignmentTaskCreate,
    AssignmentTaskRead,
    AssignmentTaskUpdate,
    AssignmentUpdate,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.grading.submissions import (
    AssessmentType,
    GradingBreakdown,
    Submission,
    SubmissionRead,
    SubmissionStatus,
)
from src.db.resource_authors import ResourceAuthor, ResourceAuthorshipStatusEnum
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses.activities.uploads.sub_file import upload_submission_file
from src.services.courses.activities.uploads.tasks_ref_files import (
    upload_reference_file,
)
from src.services.grading.assignment_breakdown import build_assignment_breakdown

logger = logging.getLogger(__name__)


def _build_assignment_read(
    assignment: Assignment,
    *,
    course_uuid: str | None = None,
    activity_uuid: str | None = None,
    activity_published: bool | None = None,
) -> AssignmentRead:
    update_data: dict[str, object] = {
        "course_uuid": course_uuid,
        "activity_uuid": activity_uuid,
    }
    if activity_published is not None:
        update_data["published"] = activity_published
    return AssignmentRead.model_validate(
        assignment,
        update=update_data,
    )


def _coerce_datetime(
    value: str | datetime | None, *, end_of_day: bool = False
) -> datetime | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        parsed = value
    else:
        normalized = value.strip()
        if normalized == "":
            return None

        if "T" in normalized:
            parsed = datetime.fromisoformat(normalized)
        else:
            parsed = datetime.combine(
                datetime.fromisoformat(normalized).date(),
                time.max if end_of_day else time.min,
            )

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _derive_due_at(
    assignment: Assignment | AssignmentCreate | AssignmentCreateWithActivity,
) -> datetime | None:
    due_at = getattr(assignment, "due_at", None)
    if due_at is not None:
        return _coerce_datetime(due_at)
    return _coerce_datetime(getattr(assignment, "due_date", None), end_of_day=True)


def _assignment_due_deadline(assignment: Assignment) -> datetime | None:
    if assignment.due_at is not None:
        return _coerce_datetime(assignment.due_at)
    return _coerce_datetime(assignment.due_date, end_of_day=True)


def _normalize_assignment_answers(
    existing_payload: object,
    patch: AssignmentDraftPatch | None,
) -> dict[str, object]:
    existing = existing_payload if isinstance(existing_payload, dict) else {}
    existing_tasks = existing.get("tasks", [])
    tasks_by_uuid: dict[str, dict[str, object]] = {}

    if isinstance(existing_tasks, list):
        for raw_task in existing_tasks:
            if not isinstance(raw_task, dict):
                continue
            task_uuid = raw_task.get("task_uuid")
            if isinstance(task_uuid, str) and task_uuid:
                tasks_by_uuid[task_uuid] = raw_task

    if patch is not None:
        for task_answer in patch.tasks:
            tasks_by_uuid[task_answer.task_uuid] = task_answer.model_dump(
                exclude_defaults=True,
                exclude_none=True,
            )

    return {
        **existing,
        "tasks": list(tasks_by_uuid.values()),
    }


def _validate_assignment_answer_tasks(
    patch: AssignmentDraftPatch | None,
    assignment_tasks: list[AssignmentTask],
) -> None:
    if patch is None:
        return

    allowed_task_uuids = {task.assignment_task_uuid for task in assignment_tasks}
    invalid_task_uuids = [
        task.task_uuid
        for task in patch.tasks
        if task.task_uuid not in allowed_task_uuids
    ]
    if invalid_task_uuids:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "One or more task answers do not belong to this assignment",
                "task_uuids": invalid_task_uuids,
            },
        )


def _get_assignment_context(
    assignment_uuid: str,
    db_session: Session,
) -> tuple[Assignment, Activity, Course]:
    assignment = db_session.exec(
        select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    activity = db_session.exec(
        select(Activity).where(Activity.id == assignment.activity_id)
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    course_id = activity.course_id or assignment.course_id
    course = db_session.exec(select(Course).where(Course.id == course_id)).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    return assignment, activity, course


def _get_assignment_task_context(
    assignment_uuid: str,
    assignment_task_uuid: str,
    db_session: Session,
) -> tuple[AssignmentTask, Assignment, Activity, Course]:
    assignment, activity, course = _get_assignment_context(assignment_uuid, db_session)
    assignment_task = db_session.exec(
        select(AssignmentTask).where(
            AssignmentTask.assignment_task_uuid == assignment_task_uuid
        )
    ).first()
    if not assignment_task:
        raise HTTPException(status_code=404, detail="Assignment Task not found")
    if assignment_task.assignment_id != assignment.id:
        raise HTTPException(
            status_code=404,
            detail="Assignment task does not belong to this assignment",
        )
    return assignment_task, assignment, activity, course


def _require_assignment_submit_access(
    current_user: PublicUser | AnonymousUser,
    course: Course,
    db_session: Session,
) -> None:
    if isinstance(current_user, AnonymousUser):
        raise HTTPException(status_code=401, detail="Authentication required")

    if not _user_has_course_access(current_user.id, course, db_session):
        raise HTTPException(
            status_code=403,
            detail="You must be enrolled in this course to submit assignments",
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:submit",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )


def _count_previous_assignment_attempts(
    activity_id: int,
    user_id: int,
    db_session: Session,
) -> int:
    return len(
        db_session.exec(
            select(Submission).where(
                Submission.activity_id == activity_id,
                Submission.user_id == user_id,
                Submission.assessment_type == AssessmentType.ASSIGNMENT,
                Submission.status != SubmissionStatus.DRAFT,
            )
        ).all()
    )


def _get_assignment_tasks(
    assignment_id: int,
    db_session: Session,
) -> list[AssignmentTask]:
    return db_session.exec(
        select(AssignmentTask)
        .where(AssignmentTask.assignment_id == assignment_id)
        .order_by(AssignmentTask.order, AssignmentTask.id)
    ).all()


def _get_open_assignment_draft(
    activity_id: int,
    user_id: int,
    db_session: Session,
) -> Submission | None:
    return db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity_id,
            Submission.user_id == user_id,
            Submission.assessment_type == AssessmentType.ASSIGNMENT,
            Submission.status == SubmissionStatus.DRAFT,
        )
    ).first()


def _get_blocking_assignment_submission(
    activity_id: int,
    user_id: int,
    db_session: Session,
) -> Submission | None:
    return db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity_id,
            Submission.user_id == user_id,
            Submission.assessment_type == AssessmentType.ASSIGNMENT,
            Submission.status.in_([
                SubmissionStatus.PENDING,
                SubmissionStatus.GRADED,
                SubmissionStatus.PUBLISHED,
            ]),
        )
    ).first()


def _get_active_course_author_user_ids(course: Course, db_session: Session) -> set[int]:
    author_ids = db_session.exec(
        select(ResourceAuthor.user_id).where(
            ResourceAuthor.resource_uuid == course.course_uuid,
            ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
        )
    ).all()
    return {user_id for user_id in author_ids if user_id is not None}


def _get_course_member_user_ids(course: Course, db_session: Session) -> set[int]:
    member_ids = db_session.exec(
        select(UserGroupUser.user_id)
        .join(
            UserGroupResource,
            UserGroupUser.usergroup_id == UserGroupResource.usergroup_id,
        )
        .where(UserGroupResource.resource_uuid == course.course_uuid)
    ).all()
    return {user_id for user_id in member_ids if user_id is not None}


def _user_has_course_access(user_id: int, course: Course, db_session: Session) -> bool:
    if course.public:
        return True

    author_stmt = select(ResourceAuthor.id).where(
        ResourceAuthor.resource_uuid == course.course_uuid,
        ResourceAuthor.user_id == user_id,
        ResourceAuthor.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE,
    )
    if db_session.exec(author_stmt).first() is not None:
        return True

    linked_groups = db_session.exec(
        select(UserGroupResource.id).where(
            UserGroupResource.resource_uuid == course.course_uuid
        )
    ).all()
    if not linked_groups:
        return True

    member_stmt = (
        select(UserGroupUser.id)
        .join(
            UserGroupResource,
            UserGroupUser.usergroup_id == UserGroupResource.usergroup_id,
        )
        .where(
            UserGroupResource.resource_uuid == course.course_uuid,
            UserGroupUser.user_id == user_id,
        )
    )
    return db_session.exec(member_stmt).first() is not None


async def get_assignment_draft_submission(
    request: Request,
    assignment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> AssignmentDraftRead:
    assignment, activity, course = _get_assignment_context(assignment_uuid, db_session)
    _require_assignment_submit_access(current_user, course, db_session)

    draft = _get_open_assignment_draft(activity.id, current_user.id, db_session)
    return AssignmentDraftRead(
        assignment_uuid=assignment.assignment_uuid,
        submission=SubmissionRead.model_validate(draft) if draft else None,
    )


async def save_assignment_draft_submission(
    request: Request,
    assignment_uuid: str,
    draft_patch: AssignmentDraftPatch,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionRead:
    assignment, activity, course = _get_assignment_context(assignment_uuid, db_session)
    _require_assignment_submit_access(current_user, course, db_session)

    blocking_submission = _get_blocking_assignment_submission(
        activity.id,
        current_user.id,
        db_session,
    )
    if blocking_submission:
        raise HTTPException(
            status_code=409,
            detail="Assignment has already been submitted",
        )

    assignment_tasks = _get_assignment_tasks(assignment.id, db_session)
    _validate_assignment_answer_tasks(draft_patch, assignment_tasks)

    draft = _get_open_assignment_draft(activity.id, current_user.id, db_session)
    now = datetime.now(UTC)

    if not draft:
        draft = Submission(
            submission_uuid=f"submission_{ULID()}",
            assessment_type=AssessmentType.ASSIGNMENT,
            activity_id=activity.id,
            user_id=current_user.id,
            status=SubmissionStatus.DRAFT,
            attempt_number=_count_previous_assignment_attempts(
                activity.id,
                current_user.id,
                db_session,
            )
            + 1,
            answers_json={},
            grading_json={},
            started_at=now,
            created_at=now,
            updated_at=now,
        )

    draft.answers_json = _normalize_assignment_answers(
        draft.answers_json,
        draft_patch,
    )
    draft.updated_at = now

    db_session.add(draft)
    db_session.commit()
    db_session.refresh(draft)

    return SubmissionRead.model_validate(draft)


async def submit_assignment_draft_submission(
    request: Request,
    assignment_uuid: str,
    draft_patch: AssignmentDraftPatch | None,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionRead:
    assignment, activity, course = _get_assignment_context(assignment_uuid, db_session)
    _require_assignment_submit_access(current_user, course, db_session)

    existing_submitted = _get_blocking_assignment_submission(
        activity.id,
        current_user.id,
        db_session,
    )
    if existing_submitted:
        return SubmissionRead.model_validate(existing_submitted)

    assignment_tasks = _get_assignment_tasks(assignment.id, db_session)
    _validate_assignment_answer_tasks(draft_patch, assignment_tasks)

    draft = _get_open_assignment_draft(activity.id, current_user.id, db_session)
    now = datetime.now(UTC)

    if not draft:
        draft = Submission(
            submission_uuid=f"submission_{ULID()}",
            assessment_type=AssessmentType.ASSIGNMENT,
            activity_id=activity.id,
            user_id=current_user.id,
            status=SubmissionStatus.DRAFT,
            attempt_number=_count_previous_assignment_attempts(
                activity.id,
                current_user.id,
                db_session,
            )
            + 1,
            answers_json={},
            grading_json={},
            started_at=now,
            created_at=now,
            updated_at=now,
        )

    draft.answers_json = _normalize_assignment_answers(
        draft.answers_json,
        draft_patch,
    )
    draft.grading_json = build_assignment_breakdown(
        GradingBreakdown(),
        draft.answers_json,
        assignment_tasks,
    ).model_dump()
    draft.status = SubmissionStatus.PENDING
    draft.is_late = (
        deadline := _assignment_due_deadline(assignment)
    ) is not None and now > deadline
    draft.submitted_at = now
    draft.graded_at = None
    draft.updated_at = now

    db_session.add(draft)
    db_session.commit()
    db_session.refresh(draft)

    return SubmissionRead.model_validate(draft)


## > Assignments CRUD


async def create_assignment(
    request: Request,
    assignment_object: AssignmentCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentRead:
    raise HTTPException(
        status_code=410,
        detail=(
            "Standalone assignment creation is disabled. "
            "Create assignments through /assignments/with-activity so the "
            "assignment and activity are created transactionally."
        ),
    )


async def read_assignment(
    request: Request,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentRead:
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # return assignment read
    activity = db_session.exec(
        select(Activity).where(Activity.id == assignment.activity_id)
    ).first()
    return _build_assignment_read(
        assignment,
        course_uuid=course.course_uuid,
        activity_uuid=activity.activity_uuid if activity else None,
        activity_published=activity.published if activity else None,
    )


async def read_assignment_from_activity_uuid(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentRead:
    # Check if activity exists
    statement = select(Activity).where(Activity.activity_uuid == activity_uuid)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=404,
            detail="Activity not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == activity.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.activity_id == activity.id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # return assignment read
    return _build_assignment_read(
        assignment,
        course_uuid=course.course_uuid,
        activity_uuid=activity.activity_uuid,
        activity_published=activity.published,
    )


async def update_assignment(
    request: Request,
    assignment_uuid: str,
    assignment_object: AssignmentUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentRead:
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    # Update only the fields that were passed in using model_dump with exclude_unset
    update_data = assignment_object.model_dump(exclude_unset=True)
    if "published" in update_data:
        raise HTTPException(
            status_code=400,
            detail="Assignment visibility is controlled by activity.published",
        )
    forbidden_fields = {"course_id", "chapter_id", "activity_id"}
    attempted_forbidden_updates = forbidden_fields.intersection(update_data.keys())
    if attempted_forbidden_updates:
        raise HTTPException(
            status_code=400,
            detail="Cannot change assignment ownership",
        )

    for field, value in update_data.items():
        setattr(assignment, field, value)

    if "due_date" in update_data and "due_at" not in update_data:
        assignment.due_at = _derive_due_at(assignment)

    assignment.update_date = datetime.now().isoformat()

    # Insert Assignment in DB
    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)

    # return assignment read
    activity = db_session.exec(
        select(Activity).where(Activity.id == assignment.activity_id)
    ).first()
    return _build_assignment_read(
        assignment,
        course_uuid=course.course_uuid,
        activity_uuid=activity.activity_uuid if activity else None,
        activity_published=activity.published if activity else None,
    )


async def delete_assignment(
    request: Request,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:delete",
        resource_owner_id=course.creator_id,
    )

    raise HTTPException(
        status_code=409,
        detail=(
            "Assignments are owned by their activity. Delete the assignment "
            "activity to remove the assignment and its tasks transactionally."
        ),
    )


async def delete_assignment_from_activity_uuid(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    # Check if activity exists
    statement = select(Activity).where(Activity.activity_uuid == activity_uuid)

    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(
            status_code=404,
            detail="Activity not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == activity.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.activity_id == activity.id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:delete",
        resource_owner_id=course.creator_id,
    )

    # Delete the activity; assignment and tasks cascade from the activity/assignment FKs.
    db_session.delete(activity)
    db_session.commit()

    return {"message": "Assignment activity deleted"}


## > Assignments Tasks CRUD


async def create_assignment_task(
    request: Request,
    assignment_uuid: str,
    assignment_task_object: AssignmentTaskCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskRead:
    # Check if assignment exists
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:create",
        resource_owner_id=course.creator_id,
    )

    # Create Assignment Task
    task_data = assignment_task_object.model_dump(exclude_unset=True)
    assignment_task = AssignmentTask(**task_data)

    assignment_task.assignment_task_uuid = f"assignmenttask_{ULID()}"
    assignment_task.creation_date = datetime.now().isoformat()
    assignment_task.update_date = datetime.now().isoformat()
    assignment_task.chapter_id = assignment.chapter_id
    assignment_task.activity_id = assignment.activity_id
    assignment_task.assignment_id = assignment.id
    assignment_task.course_id = assignment.course_id
    last_task = db_session.exec(
        select(AssignmentTask)
        .where(AssignmentTask.assignment_id == assignment.id)
        .order_by(AssignmentTask.order.desc(), AssignmentTask.id.desc())
    ).first()
    assignment_task.order = (last_task.order if last_task else -1) + 1

    # Insert Assignment Task in DB
    db_session.add(assignment_task)
    db_session.commit()
    db_session.refresh(assignment_task)

    # return assignment task read
    return AssignmentTaskRead.model_validate(assignment_task)


async def read_assignment_tasks(
    request: Request,
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[AssignmentTaskRead]:
    # Find assignment
    statement = select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Find assignments tasks for an assignment
    statement = (
        select(AssignmentTask)
        .where(AssignmentTask.assignment_id == assignment.id)
        .order_by(
            AssignmentTask.order,
            AssignmentTask.id,
        )
    )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # return assignment tasks read
    return [
        AssignmentTaskRead.model_validate(assignment_task)
        for assignment_task in db_session.exec(statement).all()
    ]


async def read_assignment_task(
    request: Request,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskRead:
    # Find assignment
    statement = select(AssignmentTask).where(
        AssignmentTask.assignment_task_uuid == assignment_task_uuid
    )
    assignmenttask = db_session.exec(statement).first()

    if not assignmenttask:
        raise HTTPException(
            status_code=404,
            detail="Assignment Task not found",
        )

    # Check if assignment exists
    statement = select(Assignment).where(Assignment.id == assignmenttask.assignment_id)
    assignment = db_session.exec(statement).first()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Assignment not found",
        )

    # Check if course exists
    statement = select(Course).where(Course.id == assignment.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # return assignment task read
    return AssignmentTaskRead.model_validate(assignmenttask)


async def put_assignment_task_reference_file(
    request: Request,
    db_session: Session,
    assignment_uuid: str,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    reference_file: UploadFile | None = None,
) -> AssignmentTaskRead:
    assignment_task, assignment, activity, course = _get_assignment_task_context(
        assignment_uuid, assignment_task_uuid, db_session
    )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    # Upload reference file
    if reference_file and reference_file.filename:
        name_in_disk = (
            f"{assignment_task_uuid}{ULID()}.{reference_file.filename.split('.')[-1]}"
        )
        await upload_reference_file(
            reference_file,
            name_in_disk,
            activity.activity_uuid,
            course.course_uuid,
            assignment.assignment_uuid,
            assignment_task_uuid,
        )
        # Update reference file
        assignment_task.reference_file = name_in_disk

    assignment_task.update_date = datetime.now().isoformat()

    # Insert Assignment Task in DB
    db_session.add(assignment_task)
    db_session.commit()
    db_session.refresh(assignment_task)

    # return assignment task read
    return AssignmentTaskRead.model_validate(assignment_task)


async def put_assignment_task_submission_file(
    request: Request,
    db_session: Session,
    assignment_uuid: str,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    sub_file: UploadFile | None = None,
) -> dict[str, str]:
    assignment_task, assignment, activity, course = _get_assignment_task_context(
        assignment_uuid, assignment_task_uuid, db_session
    )

    # RBAC check - only need read permission to submit files
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # Check if user is enrolled in the course
    if not _user_has_course_access(current_user.id, course, db_session):
        raise HTTPException(
            status_code=403,
            detail="You must be enrolled in this course to submit files",
        )

    # Upload submission file
    if not sub_file or not sub_file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    name_in_disk = f"{assignment_task_uuid}_sub_{current_user.email}_{ULID()}.{sub_file.filename.split('.')[-1]}"
    await upload_submission_file(
        sub_file,
        name_in_disk,
        activity.activity_uuid,
        course.course_uuid,
        assignment.assignment_uuid,
        assignment_task_uuid,
    )

    return {"file_uuid": name_in_disk}


async def update_assignment_task(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    assignment_task_object: AssignmentTaskUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskRead:
    assignment_task, assignment, activity, course = _get_assignment_task_context(
        assignment_uuid, assignment_task_uuid, db_session
    )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    # Update only the fields that were passed in using model_dump with exclude_unset
    update_data = assignment_task_object.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(assignment_task, field, value)

    assignment_task.update_date = datetime.now().isoformat()

    # Insert Assignment Task in DB
    db_session.add(assignment_task)
    db_session.commit()
    db_session.refresh(assignment_task)

    # return assignment task read
    return AssignmentTaskRead.model_validate(assignment_task)


async def delete_assignment_task(
    request: Request,
    assignment_uuid: str,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    assignment_task, assignment, activity, course = _get_assignment_task_context(
        assignment_uuid, assignment_task_uuid, db_session
    )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:delete",
        resource_owner_id=course.creator_id,
    )

    # Delete Assignment Task
    db_session.delete(assignment_task)
    db_session.commit()

    return {"message": "Assignment Task deleted"}


async def create_assignment_with_activity(
    request: Request,
    assignment_object: AssignmentCreateWithActivity,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    chapter_id: int,
    activity_name: str,
) -> AssignmentRead:
    """
    Create assignment with activity in a single transaction for better performance.
    """
    # Check if course exists
    statement = select(Course).where(Course.id == assignment_object.course_id)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:create",
        resource_owner_id=course.creator_id,
    )

    # Resolve chapter for order calculation
    chapter = db_session.exec(select(Chapter).where(Chapter.id == chapter_id)).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.course_id != assignment_object.course_id:
        raise HTTPException(
            status_code=400,
            detail="Chapter does not belong to the specified course",
        )

    # Determine order within chapter
    last_in_chapter = db_session.exec(
        select(Activity)
        .where(Activity.chapter_id == chapter_id)
        .order_by(Activity.order.desc())
    ).first()
    next_order = (last_in_chapter.order if last_in_chapter else 0) + 1

    # Create Activity first
    activity = Activity(
        name=activity_name,
        activity_type=ActivityTypeEnum.TYPE_ASSIGNMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_ASSIGNMENT_ANY,
        published=assignment_object.published,
        chapter_id=chapter_id,
        course_id=assignment_object.course_id,  # keep legacy column in sync
        order=next_order,
        creator_id=current_user.id,
        activity_uuid=f"activity_{ULID()}",
        creation_date=datetime.now().isoformat(),
        update_date=datetime.now().isoformat(),
    )

    # Insert Activity in DB
    db_session.add(activity)
    db_session.flush()  # Flush to get the ID without committing

    assignment_data = assignment_object.model_dump(exclude_unset=True)
    assignment = Assignment(**assignment_data)

    assignment.assignment_uuid = f"assignment_{ULID()}"
    assignment.creation_date = datetime.now().isoformat()
    assignment.update_date = datetime.now().isoformat()
    assignment.due_at = _derive_due_at(assignment_object)
    assignment.activity_id = activity.id
    assignment.chapter_id = chapter_id

    # Insert Assignment in DB
    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)

    # return assignment read
    return _build_assignment_read(
        assignment,
        course_uuid=course.course_uuid,
        activity_uuid=activity.activity_uuid,
        activity_published=activity.published,
    )


async def get_assignments_from_course(
    request: Request,
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[AssignmentRead]:
    # Find course
    statement = select(Course).where(Course.course_uuid == course_uuid)
    course = db_session.exec(statement).first()

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found",
        )

    # Get Activities
    statement = select(Activity).where(Activity.course_id == course.id)
    activities = db_session.exec(statement).all()

    # Get Assignments in a single batch query
    activity_ids = [a.id for a in activities]
    assignments = []
    if activity_ids:
        assignments = db_session.exec(
            select(Assignment).where(Assignment.activity_id.in_(activity_ids))
        ).all()

    # RBAC check
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    # return assignments read
    activities_by_id = {
        activity.id: activity for activity in activities if activity.id is not None
    }

    return [
        _build_assignment_read(
            assignment,
            course_uuid=course.course_uuid,
            activity_uuid=activities_by_id.get(assignment.activity_id).activity_uuid
            if activities_by_id.get(assignment.activity_id)
            else None,
            activity_published=activities_by_id.get(assignment.activity_id).published
            if activities_by_id.get(assignment.activity_id)
            else None,
        )
        for assignment in assignments
    ]


async def get_assignments_from_courses(
    request: Request,
    course_uuids: list[str],
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, list[AssignmentRead]]:
    """
    Get assignments for multiple courses in a single request. Returns a mapping
    of course_uuid -> list[AssignmentRead]. An entry is present for each input
    course_uuid (empty list if no assignments or course not found).
    """
    # Fetch courses that exist
    statement = select(Course).where(Course.course_uuid.in_(course_uuids))
    courses = db_session.exec(statement).all()

    # Build helper maps
    course_id_to_uuid = {c.id: c.course_uuid for c in courses}

    # Check RBAC for each found course
    checker = PermissionChecker(db_session)
    for c in courses:
        checker.require(
            current_user.id,
            "assignment:read",
            is_assigned=True,
            resource_owner_id=c.creator_id,
        )

    course_ids = list(course_id_to_uuid.keys())

    # Load activities for those courses
    activities = []
    if course_ids:
        statement = select(Activity).where(Activity.course_id.in_(course_ids))
        activities = db_session.exec(statement).all()

    activity_id_to_course_uuid = {
        a.id: course_id_to_uuid.get(a.course_id) for a in activities
    }
    activity_ids = list(activity_id_to_course_uuid.keys())

    # Load assignments for those activities
    assignments = []
    if activity_ids:
        statement = select(Assignment).where(Assignment.activity_id.in_(activity_ids))
        assignments = db_session.exec(statement).all()

    # Build result mapping (preserve input course order/keys)
    result: dict[str, list[AssignmentRead]] = {uuid: [] for uuid in course_uuids}
    activities_by_id = {
        activity.id: activity for activity in activities if activity.id is not None
    }
    for assignment in assignments:
        course_uuid = activity_id_to_course_uuid.get(assignment.activity_id)
        activity = activities_by_id.get(assignment.activity_id)
        if course_uuid:
            result.setdefault(course_uuid, []).append(
                _build_assignment_read(
                    assignment,
                    course_uuid=course_uuid,
                    activity_uuid=activity.activity_uuid if activity else None,
                    activity_published=activity.published if activity else None,
                )
            )

    return result


async def get_editable_assignments_from_courses(
    request: Request,
    course_uuids: list[str],
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, list[AssignmentRead]]:
    """
    Get assignments the current user can edit for multiple courses.

    Only includes assignments from courses where the user has
    assignment:update permission. Returns a mapping of
    course_uuid -> list[AssignmentRead]; every input uuid is present
    (empty list when the user lacks edit access or there are no assignments).
    """
    result: dict[str, list[AssignmentRead]] = {uuid: [] for uuid in course_uuids}

    if isinstance(current_user, AnonymousUser) or not course_uuids:
        return result

    statement = select(Course).where(Course.course_uuid.in_(course_uuids))
    courses = db_session.exec(statement).all()

    checker = PermissionChecker(db_session)

    # Filter to courses where the user has assignment:update permission
    editable_course_ids: set[int] = set()
    course_id_to_uuid: dict[int, str] = {}
    for c in courses:
        if checker.check(
            current_user.id,
            "assignment:update",
            resource_owner_id=c.creator_id,
        ):
            editable_course_ids.add(c.id)
            course_id_to_uuid[c.id] = c.course_uuid

    if not editable_course_ids:
        return result

    # Load activities for editable courses
    activities_statement = select(Activity).where(
        Activity.course_id.in_(list(editable_course_ids))
    )
    activities = db_session.exec(activities_statement).all()

    activity_id_to_course_uuid = {
        a.id: course_id_to_uuid.get(a.course_id) for a in activities
    }
    activity_id_to_uuid = {
        a.id: a.activity_uuid for a in activities if a.id is not None
    }
    activity_id_to_published = {
        a.id: a.published for a in activities if a.id is not None
    }
    activity_ids = list(activity_id_to_course_uuid.keys())

    if not activity_ids:
        return result

    # Load assignments for those activities
    assignments_statement = select(Assignment).where(
        Assignment.activity_id.in_(activity_ids)
    )
    assignments = db_session.exec(assignments_statement).all()

    for assignment in assignments:
        course_uuid = activity_id_to_course_uuid.get(assignment.activity_id)
        if course_uuid:
            result.setdefault(course_uuid, []).append(
                _build_assignment_read(
                    assignment,
                    course_uuid=course_uuid,
                    activity_uuid=activity_id_to_uuid.get(assignment.activity_id),
                    activity_published=activity_id_to_published.get(
                        assignment.activity_id
                    ),
                )
            )

    return result
