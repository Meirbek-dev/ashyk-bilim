"""Bulk grading operations with persisted audit state."""

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import desc
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session, col, select

from src.db.courses.activities import Activity
from src.db.grading.bulk_actions import (
    BulkAction,
    BulkActionStatus,
    BulkActionType,
)
from src.db.grading.overrides import StudentPolicyOverride
from src.db.grading.progress import AssessmentPolicy
from src.db.grading.submissions import Submission
from src.db.users import PublicUser, User
from src.infra.db.engine import build_session_factory, get_bg_engine
from src.security.rbac import PermissionChecker
from src.services.progress.submissions import recalculate_activity_progress
from src.types import JsonObject


def create_bulk_action(
    *,
    action_type: BulkActionType,
    activity_id: int,
    performed_by: int,
    params: JsonObject,
    target_user_ids: list[int],
    db_session: Session,
) -> BulkAction:
    action = BulkAction(
        action_type=action_type,
        activity_id=activity_id,
        performed_by=performed_by,
        params=params,
        target_user_ids=target_user_ids,
    )
    db_session.add(action)
    db_session.commit()
    db_session.refresh(action)
    return action


def get_bulk_action(
    *,
    action_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> BulkAction:
    action = db_session.exec(select(BulkAction).where(BulkAction.action_uuid == action_uuid)).first()
    if action is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bulk action not found",
        )

    activity = db_session.get(Activity, action.activity_id)
    if activity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Активность не найдена",
        )
    PermissionChecker(db_session).require(
        current_user.id,
        "assessment:read",
        resource_owner_id=activity.creator_id,
    )
    return action


def create_deadline_extension_action(
    *,
    activity_id: int,
    user_uuids: list[str],
    new_due_at: datetime,
    reason: str,
    current_user: PublicUser,
    db_session: Session,
    execute_inline: bool = True,
) -> BulkAction:
    """Create and execute a deadline-extension bulk action."""
    if new_due_at.tzinfo is None:
        new_due_at = new_due_at.replace(tzinfo=UTC)
    if new_due_at <= datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="new_due_at must be in the future",
        )

    activity = db_session.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Активность не найдена",
        )
    PermissionChecker(db_session).require(
        current_user.id,
        "assessment:grade",
        resource_owner_id=activity.creator_id,
    )

    policy = db_session.exec(select(AssessmentPolicy).where(AssessmentPolicy.activity_id == activity_id)).first()
    if policy is None or policy.id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment policy not found",
        )

    users = db_session.exec(select(User).where(col(User.user_uuid).in_(user_uuids))).all()
    users_by_uuid = {user.user_uuid: user for user in users}
    missing = [uuid for uuid in user_uuids if uuid not in users_by_uuid]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Unknown user UUIDs", "user_uuids": missing},
        )

    target_user_ids = [user.id for user in users if user.id is not None]
    action = create_bulk_action(
        action_type=BulkActionType.EXTEND_DEADLINE,
        activity_id=activity_id,
        performed_by=current_user.id,
        params={
            "new_due_at": new_due_at.isoformat(),
            "reason": reason,
            "user_uuids": user_uuids,
        },
        target_user_ids=target_user_ids,
        db_session=db_session,
    )
    if execute_inline:
        # Legacy/test path: run the core DB work synchronously without
        # the async SSE publish (which requires a running event loop).
        # Production always uses execute_inline=False + taskiq task.
        _execute_deadline_extension_sync(
            action_uuid=action.action_uuid,
            policy=policy,
            new_due_at=new_due_at,
            reason=reason,
            db_session=db_session,
        )
        db_session.refresh(action)
    return action


async def run_deadline_extension_action(
    action_uuid: str,
    session_factory: sessionmaker[Session] | None = None,
) -> None:
    """Taskiq-task entrypoint for queued deadline extensions."""
    if session_factory is None:
        session_factory = build_session_factory(get_bg_engine())
    with session_factory() as session:
        action = session.exec(select(BulkAction).where(BulkAction.action_uuid == action_uuid)).one()
        policy = session.exec(select(AssessmentPolicy).where(AssessmentPolicy.activity_id == action.activity_id)).one()
        raw_due_at = str(action.params.get("new_due_at", ""))
        new_due_at = datetime.fromisoformat(raw_due_at)
        if new_due_at.tzinfo is None:
            new_due_at = new_due_at.replace(tzinfo=UTC)
        await execute_deadline_extension(
            action_uuid=action_uuid,
            policy=policy,
            new_due_at=new_due_at,
            reason=str(action.params.get("reason", "")),
            db_session=session,
        )


def _execute_deadline_extension_sync(
    *,
    action_uuid: str,
    policy: AssessmentPolicy,
    new_due_at: datetime,
    reason: str,
    db_session: Session,
) -> None:
    """Synchronous DB-only portion of execute_deadline_extension.

    Used by the legacy ``execute_inline=True`` path (tests / CLI).
    Does NOT publish SSE events — callers that need SSE should use the
    async ``execute_deadline_extension`` via the taskiq worker instead.
    """
    action = db_session.exec(select(BulkAction).where(BulkAction.action_uuid == action_uuid)).one()
    action.status = BulkActionStatus.RUNNING
    db_session.add(action)
    db_session.commit()

    try:
        now = datetime.now(UTC)
        affected = 0
        for user_id in action.target_user_ids:
            override = db_session.exec(
                select(StudentPolicyOverride).where(
                    StudentPolicyOverride.policy_id == policy.id,
                    StudentPolicyOverride.user_id == user_id,
                )
            ).first()
            if override is None:
                override = StudentPolicyOverride(
                    policy_id=policy.id,
                    user_id=user_id,
                    granted_by=action.performed_by,
                )
            override.due_at_override = new_due_at
            override.note = reason
            override.updated_at = now
            db_session.add(override)
            affected += 1

        action.status = BulkActionStatus.COMPLETED
        action.affected_count = affected
        action.completed_at = now
        db_session.add(action)
        db_session.commit()
    except Exception as exc:
        db_session.rollback()
        action.status = BulkActionStatus.FAILED
        action.error_log = str(exc)
        action.completed_at = datetime.now(UTC)
        db_session.add(action)
        db_session.commit()
        raise


async def execute_deadline_extension(
    *,
    action_uuid: str,
    policy: AssessmentPolicy,
    new_due_at: datetime,
    reason: str,
    db_session: Session,
) -> None:
    action = db_session.exec(select(BulkAction).where(BulkAction.action_uuid == action_uuid)).one()
    action.status = BulkActionStatus.RUNNING
    db_session.add(action)
    db_session.commit()

    try:
        now = datetime.now(UTC)
        affected = 0
        for user_id in action.target_user_ids:
            override = db_session.exec(
                select(StudentPolicyOverride).where(
                    StudentPolicyOverride.policy_id == policy.id,
                    StudentPolicyOverride.user_id == user_id,
                )
            ).first()
            if override is None:
                override = StudentPolicyOverride(
                    policy_id=policy.id,
                    user_id=user_id,
                    granted_by=action.performed_by,
                )
            override.due_at_override = new_due_at
            override.note = reason
            override.updated_at = now
            db_session.add(override)
            affected += 1

            submissions = db_session.exec(
                select(Submission).where(
                    Submission.activity_id == action.activity_id,
                    Submission.user_id == user_id,
                    col(Submission.submitted_at).is_not(None),
                )
            ).all()
            for submission in submissions:
                submitted_at = submission.submitted_at
                if submitted_at is not None and submitted_at.tzinfo is None:
                    submitted_at = submitted_at.replace(tzinfo=UTC)
                submission.is_late = submitted_at is not None and submitted_at > new_due_at
                submission.updated_at = now
                db_session.add(submission)
                recalculate_activity_progress(
                    submission.activity_id,
                    submission.user_id,
                    db_session,
                    commit=False,
                )

        action.status = BulkActionStatus.COMPLETED
        action.affected_count = affected
        action.completed_at = now
        db_session.add(action)
        db_session.commit()

        for submission_uuid in _latest_submission_uuids(
            action.activity_id,
            action.target_user_ids,
            db_session,
        ):
            await _publish_event_durable(
                "deadline.extended",
                submission_uuid,
                {
                    "submission_uuid": submission_uuid,
                    "activity_id": action.activity_id,
                    "new_due_at": new_due_at.isoformat(),
                },
            )
    except Exception as exc:
        db_session.rollback()
        action.status = BulkActionStatus.FAILED
        action.error_log = str(exc)
        action.completed_at = datetime.now(UTC)
        db_session.add(action)
        db_session.commit()
        raise


async def _publish_event_durable(
    event_type: str,
    submission_uuid: str,
    payload: JsonObject,
) -> None:
    """Durably enqueue a grading SSE event via taskiq.

    Replaces the old ``_publish_event_safe`` which used a fragile
    ``asyncio.get_running_loop() / asyncio.run()`` pattern that could
    deadlock and provided no retry guarantee.

    ``execute_deadline_extension`` is called from the taskiq worker
    (async context), so we can simply await the kiq call.
    """
    from src.worker.tasks.sse import publish_grading_event_task

    await publish_grading_event_task.kiq(event_type, submission_uuid, payload)


def _latest_submission_uuids(
    activity_id: int,
    user_ids: list[int],
    db_session: Session,
) -> list[str]:
    uuids: list[str] = []
    for user_id in user_ids:
        submission = db_session.exec(
            select(Submission)
            .where(
                Submission.activity_id == activity_id,
                Submission.user_id == user_id,
            )
            .order_by(desc(Submission.created_at), desc(Submission.id))
        ).first()
        if submission is not None:
            uuids.append(submission.submission_uuid)
    return uuids
