import asyncio
import contextlib
import hashlib
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlmodel import Session

from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user
from src.services.ai.ai import (
    ai_send_activity_chat_message,
    ai_send_activity_chat_message_stream,
    ai_start_activity_chat_session,
    ai_start_activity_chat_session_stream,
)
from src.services.ai.schemas.ai import (
    ActivityAIChatSessionResponse,
    SendActivityAIChatMessage,
    StartActivityAIChatSession,
)
from src.services.ai.streaming import format_sse_message

logger = logging.getLogger(__name__)


# Initialize rate limiter: prefer auth token or X-User-Id header, fallback to IP
def _rate_limit_key(request: Request) -> str:
    # Prefer an explicit user header if present (set by upstream auth middleware)
    user_header = request.headers.get("x-user-id") or request.headers.get("X-User-Id")
    if user_header:
        return f"user:{user_header}"

    # Prefer Authorization bearer token to key by user token
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth:
        try:
            parts = auth.split()
            if len(parts) == 2 and parts[0].lower() == "bearer":
                token = parts[1]
                return f"token:{hashlib.sha256(token.encode()).hexdigest()}"
            return f"auth:{hashlib.sha256(auth.encode()).hexdigest()}"
        except (IndexError, AttributeError):
            pass

    # Fallback to remote address
    return get_remote_address(request)


# Initialize limiter using per-user key when available
limiter = Limiter(key_func=_rate_limit_key)

router = APIRouter()


async def _monitor_disconnect(
    request: Request, cancel_event: asyncio.Event, label: str = "stream"
) -> None:
    """Poll for client disconnect and set cancel_event when detected."""
    try:
        while not cancel_event.is_set():
            if await request.is_disconnected():
                cancel_event.set()
                logger.info(
                    "Disconnect monitor (%s): client gone, cancelling stream", label
                )
                return
            await asyncio.sleep(0.1)
    except asyncio.CancelledError:
        pass


@router.post(
    "/start/activity_chat_session", response_model=ActivityAIChatSessionResponse
)
@limiter.limit("10/minute")  # 10 requests per minute per IP
async def api_ai_start_activity_chat_session(
    request: Request,
    chat_session_object: StartActivityAIChatSession,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ActivityAIChatSessionResponse:
    """
    Start a new AI Chat session with a Course Activity.

    Rate limit: 10 requests per minute per IP address.

    Raises:
        HTTPException 429: Rate limit exceeded
        HTTPException 404: Activity not found
        HTTPException 403: AI feature disabled
        HTTPException 504: AI processing timeout
        HTTPException 500: AI processing error
    """
    logger.info("AI chat session start request from user %s", current_user.id)

    try:
        return await ai_start_activity_chat_session(
            request, chat_session_object, current_user, db_session
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in AI start endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error") from e


@router.post(
    "/send/activity_chat_message", response_model=ActivityAIChatSessionResponse
)
@limiter.limit(
    "20/minute"
)  # 20 requests per minute per IP (higher limit for chat messages)
async def api_ai_send_activity_chat_message(
    request: Request,
    chat_session_object: SendActivityAIChatMessage,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ActivityAIChatSessionResponse:
    """
    Send a message to an AI Chat session with a Course Activity.

    Rate limit: 20 requests per minute per IP address.

    Raises:
        HTTPException 429: Rate limit exceeded
        HTTPException 404: Activity not found
        HTTPException 403: AI feature disabled
        HTTPException 504: AI processing timeout
        HTTPException 500: AI processing error
    """
    logger.info("AI chat message request from user %s", current_user.id)

    try:
        return await ai_send_activity_chat_message(
            request, chat_session_object, current_user, db_session
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in AI send endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error") from e


@router.post("/start/activity_chat_session_stream")
@limiter.limit("10/minute")
async def api_ai_start_activity_chat_session_stream(
    request: Request,
    chat_session_object: StartActivityAIChatSession,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    """
    Start a new AI Chat session with streaming responses (SSE).

    This endpoint provides real-time streaming of AI responses for better
    perceived performance. Clients receive response chunks as they're generated.

    Rate limit: 10 requests per minute per IP address.

    Returns:
        Server-Sent Events (SSE) stream with AI response chunks

    Event types:
        - status: Processing status updates
        - chunk: Individual response chunks
        - final: Complete response
        - error: Error information

    Raises:
        HTTPException 429: Rate limit exceeded
        HTTPException 404: Activity not found
        HTTPException 403: AI feature disabled or streaming not enabled
        HTTPException 504: AI processing timeout
        HTTPException 500: AI processing error
    """
    logger.info("AI streaming chat session start request from user %s", current_user.id)

    try:
        cancel_event = asyncio.Event()

        async def disconnect_monitor_start() -> None:
            try:
                while not cancel_event.is_set():
                    if await request.is_disconnected():
                        cancel_event.set()
                        logger.info(
                            "Disconnect monitor: client gone, aborting start-session stream"
                        )
                        break
                    await asyncio.sleep(0.5)
            except asyncio.CancelledError:
                pass

        async def event_generator():
            monitor_task = asyncio.create_task(disconnect_monitor_start())
            try:
                async for sse_string in ai_start_activity_chat_session_stream(
                    request,
                    chat_session_object,
                    current_user,
                    db_session,
                    cancel_event=cancel_event,
                ):
                    if cancel_event.is_set():
                        return
                    yield sse_string
            except Exception as e:
                logger.exception(f"Error in streaming generator: {e}")
                yield format_sse_message(
                    {
                        "type": "error",
                        "error": "Внутренняя ошибка.",
                        "error_code": "STREAM_ERROR",
                    }
                )
            finally:
                cancel_event.set()
                monitor_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await monitor_task

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream; charset=utf-8",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in AI streaming endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error") from e


@router.post("/send/activity_chat_message_stream")
@limiter.limit("20/minute")
async def api_ai_send_activity_chat_message_stream(
    request: Request,
    chat_session_object: SendActivityAIChatMessage,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    """
    Send a message to AI Chat session with streaming responses (SSE).

    Rate limit: 20 requests per minute per IP address.

    Returns:
        Server-Sent Events (SSE) stream with AI response chunks

    Raises:
        HTTPException 429: Rate limit exceeded
        HTTPException 404: Activity not found
        HTTPException 403: AI feature disabled or streaming not enabled
        HTTPException 504: AI processing timeout
        HTTPException 500: AI processing error
    """
    logger.info("AI streaming chat message request from user %s", current_user.id)

    try:
        cancel_event = asyncio.Event()

        async def event_generator():
            monitor_task = asyncio.create_task(
                _monitor_disconnect(request, cancel_event, "send-message")
            )
            try:
                async for sse_string in ai_send_activity_chat_message_stream(
                    request,
                    chat_session_object,
                    current_user,
                    db_session,
                    cancel_event=cancel_event,
                ):
                    if cancel_event.is_set():
                        return
                    yield sse_string
            except Exception as e:
                logger.exception(f"Error in streaming generator: {e}")
                yield format_sse_message(
                    {
                        "type": "error",
                        "error": "Внутренняя ошибка.",
                        "error_code": "STREAM_ERROR",
                    }
                )
            finally:
                cancel_event.set()
                monitor_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await monitor_task

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream; charset=utf-8",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error in AI streaming endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error") from e
