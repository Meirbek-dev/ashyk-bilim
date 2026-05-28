from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from src.auth.users import get_public_user
from src.db.courses.activities import Activity
from src.db.grading.submissions import Submission
from src.db.users import PublicUser
from src.infra import redis as redis_infra
from src.infra.db.session import get_db_session
from src.security.rbac import PermissionChecker
from src.services.grading.events import (
    encode_sse,
    get_events_since,
    grading_channel,
    grading_event,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Maximum concurrent SSE connections per user (across all submissions).
_MAX_CONNECTIONS_PER_USER = 5
# Seconds between keepalive comments sent to the client.
_KEEPALIVE_INTERVAL = 30

# In-process fallback counter used when Redis is unavailable.
_local_conn_counts: dict[int, int] = defaultdict(int)


def _conn_key(user_id: int) -> str:
    return f"sse_conn:{user_id}"


def _get_streamable_submission(
    submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> Submission:
    submission = db_session.exec(select(Submission).where(Submission.submission_uuid == submission_uuid)).first()
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Отправка не найдена",
        )
    if submission.user_id == current_user.id:
        return submission

    activity = db_session.get(Activity, submission.activity_id)
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
    return submission


@router.get("/submissions/{submission_uuid}/feedback-stream")
async def api_feedback_stream(
    request: Request,
    submission_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    """Stream grading events for one submission via Redis pub/sub.

    Supports:
    - ``Last-Event-ID`` header for event replay (reconnects get missed events).
    - Per-user connection limit (``_MAX_CONNECTIONS_PER_USER``).
    - 30-second keepalive comments to prevent proxy timeouts.
    - ULID-based event IDs for client-side deduplication.
    """
    _get_streamable_submission(submission_uuid, current_user, db_session)

    redis = redis_infra.get_async()
    user_id = current_user.id
    conn_key = _conn_key(user_id)

    # ── Connection limit check ────────────────────────────────────────────────
    if redis is not None:
        try:
            current_conn_count = await redis.get(conn_key)
            if current_conn_count and int(current_conn_count) >= _MAX_CONNECTIONS_PER_USER:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "code": "SSE_CONNECTION_LIMIT",
                        "message": (
                            f"Слишком много одновременных SSE-соединений (лимит: {_MAX_CONNECTIONS_PER_USER})."
                        ),
                        "limit": _MAX_CONNECTIONS_PER_USER,
                    },
                    headers={"Retry-After": "60"},
                )
        except HTTPException:
            raise
        except Exception:
            # Redis unavailable — fall through to in-process counter
            logger.warning("Redis недоступен для проверки SSE-соединения", exc_info=True)
            redis = None

    if redis is None and _local_conn_counts[user_id] >= _MAX_CONNECTIONS_PER_USER:
        # In-process fallback: enforce limit without Redis to prevent DoS.
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "SSE_CONNECTION_LIMIT",
                "message": (f"Слишком много одновременных SSE-соединений (лимит: {_MAX_CONNECTIONS_PER_USER})."),
                "limit": _MAX_CONNECTIONS_PER_USER,
            },
            headers={"Retry-After": "60"},
        )

    async def event_generator():
        nonlocal redis

        # Increment connection counter (Redis or in-process fallback)
        if redis is not None:
            try:
                await redis.incr(conn_key)
                await redis.expire(conn_key, 3600)  # auto-clean stale counter
            except Exception:
                logger.warning("Не удалось увеличить счетчик SSE-соединений", exc_info=True)
        else:
            _local_conn_counts[user_id] += 1

        try:
            # ── Replay missed events ──────────────────────────────────────────
            if last_event_id:
                try:
                    missed = await get_events_since(submission_uuid, last_event_id)
                    for event_data in missed:
                        event_type = str(event_data.get("event", "message"))
                        yield encode_sse(event_type, event_data)
                except Exception:
                    logger.warning("Не удалось повторно воспроизвести SSE", exc_info=True)

            # ── Send connected event ──────────────────────────────────────────
            yield encode_sse(
                "connected",
                grading_event("connected", submission_uuid),
            )

            if redis is None:
                # No Redis — just send keepalives until disconnect.
                while not await request.is_disconnected():
                    yield ": keepalive\n\n"
                    await asyncio.sleep(_KEEPALIVE_INTERVAL)
                return

            # ── Subscribe and stream events ───────────────────────────────────
            pubsub = redis.pubsub()
            await pubsub.subscribe(grading_channel(submission_uuid))
            try:
                while not await request.is_disconnected():
                    message = await pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=float(_KEEPALIVE_INTERVAL),
                    )
                    if message is None:
                        yield ": keepalive\n\n"
                        continue
                    raw = message.get("data")
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    if not isinstance(raw, str):
                        continue
                    try:
                        payload = json.loads(raw)
                    except Exception:
                        logger.warning("Не удалось декодировать SSE-полезную нагрузку: %s", raw)
                        continue
                    event_type = str(payload.get("event", "message"))
                    yield encode_sse(event_type, payload)
            finally:
                await pubsub.unsubscribe(grading_channel(submission_uuid))
                await pubsub.aclose()
        finally:
            # Decrement connection counter on disconnect
            if redis is not None:
                try:
                    remaining = await redis.decr(conn_key)
                    if remaining <= 0:
                        await redis.delete(conn_key)
                except Exception:
                    logger.warning("Не удалось уменьшить счетчик SSE-соединений", exc_info=True)
            else:
                _local_conn_counts[user_id] = max(0, _local_conn_counts[user_id] - 1)
                if _local_conn_counts[user_id] == 0:
                    _local_conn_counts.pop(user_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
