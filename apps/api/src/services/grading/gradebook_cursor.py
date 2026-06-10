"""Cursor-paginated gradebook for large classes.

Returns ActivityProgressCell rows in stable order using a cursor based on
(user_id, activity_id). Suitable for classes with 200+ students where the
full matrix endpoint may be slow.
"""

from __future__ import annotations

import base64
import json

from fastapi import HTTPException, status
from pydantic import Field
from sqlmodel import Session, col, select

from src.db.courses.courses import Course
from src.db.grading.gradebook import ActivityProgressCell
from src.db.grading.progress import ActivityProgress, ActivityProgressState
from src.db.grading.submissions import Submission
from src.db.resource_authors import ResourceAuthor, ResourceAuthorshipStatusEnum
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.security.rbac import PermissionChecker


class GradebookCursorPage(PydanticStrictBaseModel):
    """Cursor-paginated gradebook response."""

    cells: list[ActivityProgressCell] = Field(default_factory=list)
    next_cursor: str | None = None
    has_more: bool = False
    total: int = 0


def encode_cursor(user_id: int, activity_id: int) -> str:
    return base64.urlsafe_b64encode(json.dumps({"u": user_id, "a": activity_id}).encode()).decode()


def decode_cursor(cursor: str) -> tuple[int, int]:
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor))
        return int(data["u"]), int(data["a"])
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor",
        ) from exc


async def get_gradebook_cursor(
    *,
    course_uuid: str,
    current_user: PublicUser,
    db_session: Session,
    cursor: str | None = None,
    limit: int = 500,
) -> GradebookCursorPage:
    """Return a page of gradebook cells using cursor pagination."""
    course = _get_course_or_404(course_uuid, db_session)
    _require_gradebook_access(course, current_user, db_session)

    query = (
        select(ActivityProgress)
        .where(ActivityProgress.course_id == course.id)
        .order_by(col(ActivityProgress.user_id), col(ActivityProgress.activity_id))
    )

    if cursor is not None:
        user_id, activity_id = decode_cursor(cursor)
        query = query.where(
            (ActivityProgress.user_id > user_id)
            | ((ActivityProgress.user_id == user_id) & (ActivityProgress.activity_id > activity_id))
        )

    # Fetch one extra to determine has_more
    rows = db_session.exec(query.limit(limit + 1)).all()
    has_more = len(rows) > limit
    page_rows = rows[:limit]

    # Build cells
    submission_ids = {row.latest_submission_id for row in page_rows if row.latest_submission_id}
    submissions_by_id: dict[int, Submission] = {}
    if submission_ids:
        subs = db_session.exec(select(Submission).where(col(Submission.id).in_(submission_ids))).all()
        submissions_by_id = {s.id: s for s in subs if s.id}

    cells: list[ActivityProgressCell] = []
    for progress in page_rows:
        latest = submissions_by_id.get(progress.latest_submission_id) if progress.latest_submission_id else None
        cells.append(
            ActivityProgressCell(
                user_id=progress.user_id,
                activity_id=progress.activity_id,
                state=ActivityProgressState(progress.state),
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
        )

    next_cursor = None
    if has_more and page_rows:
        last = page_rows[-1]
        next_cursor = encode_cursor(last.user_id, last.activity_id)

    # Total count
    from sqlalchemy import func

    total = db_session.exec(select(func.count()).where(ActivityProgress.course_id == course.id)).one()

    return GradebookCursorPage(
        cells=cells,
        next_cursor=next_cursor,
        has_more=has_more,
        total=total,
    )


def _get_course_or_404(course_uuid: str, db_session: Session) -> Course:
    normalized = course_uuid if course_uuid.startswith("course_") else f"course_{course_uuid}"
    course = db_session.exec(select(Course).where(Course.course_uuid == normalized)).first()
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


def _require_gradebook_access(course: Course, current_user: PublicUser, db_session: Session) -> None:
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
