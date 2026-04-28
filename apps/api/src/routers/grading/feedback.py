"""Inline grading feedback CRUD endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc
from sqlmodel import Session, select
from ulid import ULID

from src.auth.users import get_public_user
from src.db.courses.activities import Activity
from src.db.grading.entries import GradingEntry
from src.db.grading.item_feedback import (
    ItemFeedbackCreate,
    ItemFeedbackEntry,
    ItemFeedbackRead,
    ItemFeedbackUpdate,
)
from src.db.grading.submissions import Submission
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.security.rbac import PermissionChecker
from src.services.grading.events import publish_grading_event

router = APIRouter()


def _submission_with_activity(
    submission_uuid: str,
    db_session: Session,
) -> tuple[Submission, Activity]:
    row = db_session.exec(
        select(Submission, Activity)
        .join(Activity, Activity.id == Submission.activity_id)
        .where(Submission.submission_uuid == submission_uuid)
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )
    return row


def _require_teacher(
    activity: Activity,
    current_user: PublicUser,
    db_session: Session,
) -> None:
    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:grade",
        resource_owner_id=activity.creator_id,
    )


def _can_read_feedback(
    submission: Submission,
    activity: Activity,
    current_user: PublicUser,
    db_session: Session,
) -> bool:
    if submission.user_id == current_user.id:
        return True
    return PermissionChecker(db_session).check(
        current_user.id,
        "assignment:read",
        resource_owner_id=activity.creator_id,
    )


def _latest_or_create_grading_entry(
    submission: Submission,
    current_user: PublicUser,
    db_session: Session,
    *,
    grading_entry_id: int | None = None,
) -> GradingEntry:
    if grading_entry_id is not None:
        entry = db_session.get(GradingEntry, grading_entry_id)
        if entry is None or entry.submission_id != submission.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Grading entry does not belong to this submission",
            )
        return entry

    entry = db_session.exec(
        select(GradingEntry)
        .where(GradingEntry.submission_id == submission.id)
        .order_by(desc(GradingEntry.created_at), desc(GradingEntry.id))
    ).first()
    if entry is not None:
        return entry

    now = datetime.now(UTC)
    entry = GradingEntry(
        entry_uuid=f"entry_{ULID()}",
        submission_id=submission.id,
        graded_by=current_user.id,
        raw_score=float(submission.final_score or submission.auto_score or 0),
        penalty_pct=float(submission.late_penalty_pct or 0),
        final_score=float(submission.final_score or submission.auto_score or 0),
        breakdown=submission.grading_json if isinstance(submission.grading_json, dict) else {},
        overall_feedback=(
            submission.grading_json.get("feedback", "")
            if isinstance(submission.grading_json, dict)
            else ""
        ),
        grading_version=submission.grading_version,
        created_at=now,
        published_at=None,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


@router.get(
    "/submissions/{submission_uuid}/feedback",
    response_model=list[ItemFeedbackRead],
)
async def api_list_item_feedback(
    submission_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> list[ItemFeedbackRead]:
    submission, activity = _submission_with_activity(submission_uuid, db_session)
    if not _can_read_feedback(submission, activity, current_user, db_session):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    query = (
        select(ItemFeedbackEntry)
        .join(GradingEntry, GradingEntry.id == ItemFeedbackEntry.grading_entry_id)
        .where(ItemFeedbackEntry.submission_id == submission.id)
        .order_by(ItemFeedbackEntry.created_at, ItemFeedbackEntry.id)
    )
    if submission.user_id == current_user.id:
        query = query.where(GradingEntry.published_at.is_not(None))
    return [ItemFeedbackRead.model_validate(row) for row in db_session.exec(query).all()]


@router.post(
    "/submissions/{submission_uuid}/feedback",
    response_model=ItemFeedbackRead,
)
async def api_create_item_feedback(
    submission_uuid: str,
    feedback: ItemFeedbackCreate,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> ItemFeedbackRead:
    submission, activity = _submission_with_activity(submission_uuid, db_session)
    _require_teacher(activity, current_user, db_session)

    entry = _latest_or_create_grading_entry(
        submission,
        current_user,
        db_session,
        grading_entry_id=feedback.grading_entry_id,
    )
    now = datetime.now(UTC)
    row = ItemFeedbackEntry(
        grading_entry_id=entry.id,
        submission_id=submission.id,
        task_id=feedback.task_id,
        item_ref=feedback.item_ref,
        comment=feedback.comment,
        score=feedback.score,
        max_score=feedback.max_score,
        annotation_type=feedback.annotation_type,
        annotation_data_key=feedback.annotation_data_key,
        graded_by=current_user.id,
        created_at=now,
        updated_at=now,
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    publish_grading_event(
        "feedback.created",
        submission.submission_uuid,
        ItemFeedbackRead.model_validate(row).model_dump(mode="json"),
    )
    return ItemFeedbackRead.model_validate(row)


@router.patch("/feedback/{feedback_id}", response_model=ItemFeedbackRead)
async def api_update_item_feedback(
    feedback_id: int,
    feedback: ItemFeedbackUpdate,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> ItemFeedbackRead:
    row = db_session.get(ItemFeedbackEntry, feedback_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")
    existing_submission = db_session.get(Submission, row.submission_id)
    if existing_submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    submission, activity = _submission_with_activity(existing_submission.submission_uuid, db_session)
    _require_teacher(activity, current_user, db_session)

    update = feedback.model_dump(exclude_unset=True)
    for key, value in update.items():
        setattr(row, key, value)
    row.updated_at = datetime.now(UTC)
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    publish_grading_event(
        "feedback.updated",
        submission.submission_uuid,
        ItemFeedbackRead.model_validate(row).model_dump(mode="json"),
    )
    return ItemFeedbackRead.model_validate(row)


@router.delete("/feedback/{feedback_id}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_item_feedback(
    feedback_id: int,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> None:
    row = db_session.get(ItemFeedbackEntry, feedback_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")
    submission = db_session.get(Submission, row.submission_id)
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    activity = db_session.get(Activity, submission.activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    _require_teacher(activity, current_user, db_session)

    payload = ItemFeedbackRead.model_validate(row).model_dump(mode="json")
    db_session.delete(row)
    db_session.commit()
    publish_grading_event("feedback.deleted", submission.submission_uuid, payload)
