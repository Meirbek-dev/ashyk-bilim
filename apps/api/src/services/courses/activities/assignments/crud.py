"""Assignment CRUD operations."""

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.assignments import (
    Assignment,
    AssignmentCreateWithActivity,
    AssignmentRead,
    AssignmentUpdate,
)
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.users import AnonymousUser, PublicUser
from src.security.rbac import PermissionChecker
from src.services.courses._utils import _next_activity_order
from src.services.courses.activities.assignments._queries import _get_assignment_context


def _build_assignment_read(
    assignment: Assignment,
    *,
    course_uuid: str | None = None,
    activity_uuid: str | None = None,
    activity_published: bool | None = None,
) -> AssignmentRead:
    return AssignmentRead(
        assignment_uuid=assignment.assignment_uuid,
        title=assignment.title,
        description=assignment.description,
        due_at=assignment.due_at,
        published=activity_published if activity_published is not None else assignment.published,
        grading_type=assignment.grading_type,
        course_uuid=course_uuid,
        activity_uuid=activity_uuid,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
    )


async def read_assignment(
    assignment_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentRead:
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
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

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
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentRead:
    activity = db_session.exec(
        select(Activity).where(Activity.activity_uuid == activity_uuid)
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    course = db_session.exec(
        select(Course).where(Course.id == activity.course_id)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    assignment = db_session.exec(
        select(Assignment).where(Assignment.activity_id == activity.id)
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )
    return _build_assignment_read(
        assignment,
        course_uuid=course.course_uuid,
        activity_uuid=activity.activity_uuid,
        activity_published=activity.published,
    )


async def update_assignment(
    assignment_uuid: str,
    assignment_object: AssignmentUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> AssignmentRead:
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
        "assignment:update",
        resource_owner_id=course.creator_id,
    )

    for field, value in assignment_object.model_dump(exclude_unset=True).items():
        setattr(assignment, field, value)
    assignment.updated_at = datetime.now(UTC)

    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)

    activity = db_session.exec(
        select(Activity).where(Activity.id == assignment.activity_id)
    ).first()
    return _build_assignment_read(
        assignment,
        course_uuid=course.course_uuid,
        activity_uuid=activity.activity_uuid if activity else None,
        activity_published=activity.published if activity else None,
    )


async def delete_assignment_from_activity_uuid(
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    activity = db_session.exec(
        select(Activity).where(Activity.activity_uuid == activity_uuid)
    ).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    course = db_session.exec(
        select(Course).where(Course.id == activity.course_id)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    assignment = db_session.exec(
        select(Assignment).where(Assignment.activity_id == activity.id)
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:delete",
        resource_owner_id=course.creator_id,
    )

    db_session.delete(activity)
    db_session.commit()
    return {"message": "Assignment activity deleted"}


async def create_assignment_with_activity(
    assignment_object: AssignmentCreateWithActivity,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    chapter_id: int,
    activity_name: str,
) -> AssignmentRead:
    course = db_session.exec(
        select(Course).where(Course.id == assignment_object.course_id)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:create",
        resource_owner_id=course.creator_id,
    )

    chapter = db_session.exec(
        select(Chapter).where(Chapter.id == chapter_id)
    ).first()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.course_id != assignment_object.course_id:
        raise HTTPException(
            status_code=400,
            detail="Chapter does not belong to the specified course",
        )

    now = datetime.now(UTC)
    activity = Activity(
        name=activity_name,
        activity_type=ActivityTypeEnum.TYPE_ASSIGNMENT,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_ASSIGNMENT_ANY,
        published=assignment_object.published,
        chapter_id=chapter_id,
        course_id=assignment_object.course_id,
        order=_next_activity_order(chapter_id, db_session),
        creator_id=current_user.id,
        activity_uuid=f"activity_{ULID()}",
        creation_date=now.isoformat(),
        update_date=now.isoformat(),
    )
    db_session.add(activity)
    db_session.flush()

    assignment = Assignment(
        assignment_uuid=f"assignment_{ULID()}",
        title=assignment_object.title,
        description=assignment_object.description,
        due_at=assignment_object.due_at,
        published=assignment_object.published,
        grading_type=assignment_object.grading_type,
        course_id=assignment_object.course_id,
        chapter_id=chapter_id,
        activity_id=activity.id,
        created_at=now,
        updated_at=now,
    )
    db_session.add(assignment)
    db_session.commit()
    db_session.refresh(assignment)

    return _build_assignment_read(
        assignment,
        course_uuid=course.course_uuid,
        activity_uuid=activity.activity_uuid,
        activity_published=activity.published,
    )


async def get_assignments_from_course(
    course_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[AssignmentRead]:
    course = db_session.exec(
        select(Course).where(Course.course_uuid == course_uuid)
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    activities = db_session.exec(
        select(Activity).where(Activity.course_id == course.id)
    ).all()
    activity_ids = [a.id for a in activities]

    assignments = []
    if activity_ids:
        assignments = db_session.exec(
            select(Assignment).where(Assignment.activity_id.in_(activity_ids))
        ).all()

    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    activities_by_id = {a.id: a for a in activities if a.id is not None}
    return [
        _build_assignment_read(
            a,
            course_uuid=course.course_uuid,
            activity_uuid=activities_by_id[a.activity_id].activity_uuid
            if a.activity_id in activities_by_id
            else None,
            activity_published=activities_by_id[a.activity_id].published
            if a.activity_id in activities_by_id
            else None,
        )
        for a in assignments
    ]


async def get_assignments_from_courses(
    course_uuids: list[str],
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, list[AssignmentRead]]:
    courses = db_session.exec(
        select(Course).where(Course.course_uuid.in_(course_uuids))
    ).all()
    course_id_to_uuid = {c.id: c.course_uuid for c in courses}

    checker = PermissionChecker(db_session)
    for c in courses:
        checker.require(
            current_user.id,
            "assignment:read",
            is_assigned=True,
            resource_owner_id=c.creator_id,
        )

    course_ids = list(course_id_to_uuid.keys())
    activities = (
        db_session.exec(select(Activity).where(Activity.course_id.in_(course_ids))).all()
        if course_ids
        else []
    )
    activity_id_to_course_uuid = {
        a.id: course_id_to_uuid.get(a.course_id) for a in activities
    }
    activity_ids = list(activity_id_to_course_uuid.keys())
    assignments = (
        db_session.exec(
            select(Assignment).where(Assignment.activity_id.in_(activity_ids))
        ).all()
        if activity_ids
        else []
    )

    result: dict[str, list[AssignmentRead]] = {uuid: [] for uuid in course_uuids}
    activities_by_id = {a.id: a for a in activities if a.id is not None}
    for assignment in assignments:
        c_uuid = activity_id_to_course_uuid.get(assignment.activity_id)
        activity = activities_by_id.get(assignment.activity_id)
        if c_uuid:
            result.setdefault(c_uuid, []).append(
                _build_assignment_read(
                    assignment,
                    course_uuid=c_uuid,
                    activity_uuid=activity.activity_uuid if activity else None,
                    activity_published=activity.published if activity else None,
                )
            )
    return result


async def get_editable_assignments_from_courses(
    course_uuids: list[str],
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, list[AssignmentRead]]:
    result: dict[str, list[AssignmentRead]] = {uuid: [] for uuid in course_uuids}
    if isinstance(current_user, AnonymousUser) or not course_uuids:
        return result

    courses = db_session.exec(
        select(Course).where(Course.course_uuid.in_(course_uuids))
    ).all()
    checker = PermissionChecker(db_session)
    editable_course_ids: set[int] = set()
    course_id_to_uuid: dict[int, str] = {}
    for c in courses:
        if checker.check(
            current_user.id, "assignment:update", resource_owner_id=c.creator_id
        ):
            editable_course_ids.add(c.id)
            course_id_to_uuid[c.id] = c.course_uuid

    if not editable_course_ids:
        return result

    activities = db_session.exec(
        select(Activity).where(Activity.course_id.in_(list(editable_course_ids)))
    ).all()
    activity_id_to_course_uuid = {
        a.id: course_id_to_uuid.get(a.course_id) for a in activities
    }
    activity_id_to_uuid = {a.id: a.activity_uuid for a in activities if a.id is not None}
    activity_id_to_published = {a.id: a.published for a in activities if a.id is not None}
    activity_ids = list(activity_id_to_course_uuid.keys())

    if not activity_ids:
        return result

    assignments = db_session.exec(
        select(Assignment).where(Assignment.activity_id.in_(activity_ids))
    ).all()
    for assignment in assignments:
        c_uuid = activity_id_to_course_uuid.get(assignment.activity_id)
        if c_uuid:
            result.setdefault(c_uuid, []).append(
                _build_assignment_read(
                    assignment,
                    course_uuid=c_uuid,
                    activity_uuid=activity_id_to_uuid.get(assignment.activity_id),
                    activity_published=activity_id_to_published.get(assignment.activity_id),
                )
            )
    return result
