"""Assignment task CRUD operations."""

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.assignments import (
    Assignment,
    AssignmentTask,
    AssignmentTaskCreate,
    AssignmentTaskRead,
    AssignmentTaskUpdate,
)
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses.activities.assignments._queries import (
    _get_assignment_task_context,
)


async def create_assignment_task(
    assignment_uuid: str,
    assignment_task_object: AssignmentTaskCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskRead:
    assignment = db_session.exec(
        select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course = db_session.exec(
        select(Course).where(Course.id == assignment.course_id)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:create",
        resource_owner_id=course.creator_id,
    )

    last_task = db_session.exec(
        select(AssignmentTask)
        .where(AssignmentTask.assignment_id == assignment.id)
        .order_by(AssignmentTask.order.desc(), AssignmentTask.id.desc())
    ).first()
    now = datetime.now(UTC)

    task_data = assignment_task_object.model_dump(exclude_unset=True)
    assignment_task = AssignmentTask(**task_data)
    assignment_task.assignment_task_uuid = f"assignmenttask_{ULID()}"
    assignment_task.created_at = now
    assignment_task.updated_at = now
    assignment_task.chapter_id = assignment.chapter_id
    assignment_task.activity_id = assignment.activity_id
    assignment_task.assignment_id = assignment.id
    assignment_task.course_id = assignment.course_id
    assignment_task.order = (last_task.order if last_task else -1) + 1

    db_session.add(assignment_task)
    db_session.commit()
    db_session.refresh(assignment_task)
    return AssignmentTaskRead.model_validate(assignment_task)


async def read_assignment_tasks(
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[AssignmentTaskRead]:
    assignment = db_session.exec(
        select(Assignment).where(Assignment.assignment_uuid == assignment_uuid)
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course = db_session.exec(
        select(Course).where(Course.id == assignment.course_id)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    tasks = db_session.exec(
        select(AssignmentTask)
        .where(AssignmentTask.assignment_id == assignment.id)
        .order_by(AssignmentTask.order, AssignmentTask.id)
    ).all()
    return [AssignmentTaskRead.model_validate(t) for t in tasks]


async def read_assignment_task(
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskRead:
    task = db_session.exec(
        select(AssignmentTask).where(
            AssignmentTask.assignment_task_uuid == assignment_task_uuid
        )
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Assignment Task not found")

    assignment = db_session.exec(
        select(Assignment).where(Assignment.id == task.assignment_id)
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    course = db_session.exec(
        select(Course).where(Course.id == assignment.course_id)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )
    return AssignmentTaskRead.model_validate(task)


async def update_assignment_task(
    assignment_uuid: str,
    assignment_task_uuid: str,
    assignment_task_object: AssignmentTaskUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentTaskRead:
    assignment_task, _assignment, _activity, course = _get_assignment_task_context(
        assignment_uuid, assignment_task_uuid, db_session
    )

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    for field, value in assignment_task_object.model_dump(exclude_unset=True).items():
        setattr(assignment_task, field, value)
    assignment_task.updated_at = datetime.now(UTC)

    db_session.add(assignment_task)
    db_session.commit()
    db_session.refresh(assignment_task)
    return AssignmentTaskRead.model_validate(assignment_task)


async def delete_assignment_task(
    assignment_uuid: str,
    assignment_task_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    assignment_task, _assignment, _activity, course = _get_assignment_task_context(
        assignment_uuid, assignment_task_uuid, db_session
    )

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:delete",
        resource_owner_id=course.creator_id,
    )

    db_session.delete(assignment_task)
    db_session.commit()
    return {"message": "Assignment Task deleted"}
