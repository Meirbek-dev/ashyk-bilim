"""Student-facing grading SSE stream."""

from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from src.auth.users import get_public_user
from src.db.courses.activities import Activity
from src.db.grading.submissions import Submission
from src.db.users import PublicUser
from src.infra import redis as redis_infra
from src.infra.db.session import get_db_session
from src.security.rbac import PermissionChecker
from src.services.grading.events import encode_sse, grading_channel, grading_event

router = APIRouter()


def _get_streamable_submission(
    submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> Submission:
    submission = db_session.exec(
        select(Submission).where(Submission.submission_uuid == submission_uuid)
    ).first()
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )
    if submission.user_id == current_user.id:
        return submission

    activity = db_session.get(Activity, submission.activity_id)
    if activity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )
    PermissionChecker(db_session).require(
        current_user.id,
        "assignment:read",
        resource_owner_id=activity.creator_id,
    )
    return submission


@router.get("/submissions/{submission_uuid}/feedback-stream")
async def api_feedback_stream(
    request: Request,
    submission_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
) -> StreamingResponse:
    """Stream grading events for one submission via Redis pub/sub."""
    _get_streamable_submission(submission_uuid, current_user, db_session)

    async def event_generator():
        redis = redis_infra.get_async()
        yield encode_sse(
            "connected",
            grading_event("connected", submission_uuid),
        )

        if redis is None:
            while not await request.is_disconnected():
                yield ": heartbeat\n\n"
                await asyncio.sleep(15)

        pubsub = redis.pubsub()
        await pubsub.subscribe(grading_channel(submission_uuid))
        try:
            while not await request.is_disconnected():
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=15.0,
                )
                if message is None:
                    yield ": heartbeat\n\n"
                    continue
                raw = message.get("data")
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8")
                if not isinstance(raw, str):
                    continue
                payload = json.loads(raw)
                event_type = str(payload.get("event", "message"))
                yield encode_sse(event_type, payload)
        finally:
            await pubsub.unsubscribe(grading_channel(submission_uuid))
            await pubsub.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
