import asyncio
import contextlib
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from src.auth.users import get_public_user
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
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
from src.services.rate_limit import auth_or_ip_key, rate_limit_dependency

logger = logging.getLogger(__name__)


_limit_ai_start = rate_limit_dependency(
    namespace="ai:start",
    max_requests=10,
    window_seconds=60,
    key_func=auth_or_ip_key,
)
_limit_ai_message = rate_limit_dependency(
    namespace="ai:message",
    max_requests=20,
    window_seconds=60,
    key_func=auth_or_ip_key,
)

router = APIRouter()


async def _monitor_disconnect(request: Request, cancel_event: asyncio.Event, label: str = "stream") -> None:
    """Poll for client disconnect and set cancel_event when detected."""
    try:
        while not cancel_event.is_set():
            if await request.is_disconnected():
                cancel_event.set()
                logger.info("Монитор отключения (%s): клиент ушел, поток отменяется", label)
                return
            await asyncio.sleep(0.1)
    except asyncio.CancelledError:
        pass


@router.post(
    "/start/activity_chat_session",
    response_model=ActivityAIChatSessionResponse,
    dependencies=[Depends(_limit_ai_start)],
)
async def api_ai_start_activity_chat_session(
    request: Request,
    chat_session_object: StartActivityAIChatSession,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ActivityAIChatSessionResponse:
    """
    Start a new AI Chat session with a Course Activity.

    Rate limit: 10 requests per minute per IP address.

    Raises:
        HTTPException 429: Rate limit exceeded
        HTTPException 404: Активность не найдена
        HTTPException 403: AI feature disabled
        HTTPException 504: AI processing timeout
        HTTPException 500: AI processing error
    """
    logger.info("Запрос на старт AI-чата от пользователя %s", current_user.id)

    try:
        return await ai_start_activity_chat_session(request, chat_session_object, current_user, db_session)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Непредвиденная ошибка в AI start endpoint")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post(
    "/send/activity_chat_message",
    response_model=ActivityAIChatSessionResponse,
    dependencies=[Depends(_limit_ai_message)],
)
async def api_ai_send_activity_chat_message(
    request: Request,
    chat_session_object: SendActivityAIChatMessage,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ActivityAIChatSessionResponse:
    """
    Send a message to an AI Chat session with a Course Activity.

    Rate limit: 20 requests per minute per IP address.

    Raises:
        HTTPException 429: Rate limit exceeded
        HTTPException 404: Активность не найдена
        HTTPException 403: AI feature disabled
        HTTPException 504: AI processing timeout
        HTTPException 500: AI processing error
    """
    logger.info("Запрос AI-сообщения от пользователя %s", current_user.id)

    try:
        return await ai_send_activity_chat_message(request, chat_session_object, current_user, db_session)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Непредвиденная ошибка в AI send endpoint")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post(
    "/start/activity_chat_session_stream",
    dependencies=[Depends(_limit_ai_start)],
)
async def api_ai_start_activity_chat_session_stream(
    request: Request,
    chat_session_object: StartActivityAIChatSession,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
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
        HTTPException 404: Активность не найдена
        HTTPException 403: AI feature disabled or streaming not enabled
        HTTPException 504: AI processing timeout
        HTTPException 500: AI processing error
    """
    logger.info("Запрос на старт стримингового AI-чата от пользователя %s", current_user.id)

    try:
        cancel_event = asyncio.Event()

        async def disconnect_monitor_start() -> None:
            try:
                while not cancel_event.is_set():
                    if await request.is_disconnected():
                        cancel_event.set()
                        logger.info("Монитор отключения: клиент ушел, поток start-session отменяется")
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
            except Exception:
                logger.exception("Ошибка в генераторе стриминга")
                yield format_sse_message({
                    "type": "error",
                    "error": "Внутренняя ошибка.",
                    "error_code": "STREAM_ERROR",
                })
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
    except Exception:
        logger.exception("Непредвиденная ошибка в AI streaming endpoint")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")


@router.post(
    "/send/activity_chat_message_stream",
    dependencies=[Depends(_limit_ai_message)],
)
async def api_ai_send_activity_chat_message_stream(
    request: Request,
    chat_session_object: SendActivityAIChatMessage,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    """
    Send a message to AI Chat session with streaming responses (SSE).

    Rate limit: 20 requests per minute per IP address.

    Returns:
        Server-Sent Events (SSE) stream with AI response chunks

    Raises:
        HTTPException 429: Rate limit exceeded
        HTTPException 404: Активность не найдена
        HTTPException 403: AI feature disabled or streaming not enabled
        HTTPException 504: AI processing timeout
        HTTPException 500: AI processing error
    """
    logger.info("Запрос стримингового AI-сообщения от пользователя %s", current_user.id)

    try:
        cancel_event = asyncio.Event()

        async def event_generator():
            monitor_task = asyncio.create_task(_monitor_disconnect(request, cancel_event, "send-message"))
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
            except Exception:
                logger.exception("Ошибка в генераторе стриминга")
                yield format_sse_message({
                    "type": "error",
                    "error": "Внутренняя ошибка.",
                    "error_code": "STREAM_ERROR",
                })
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
    except Exception:
        logger.exception("Непредвиденная ошибка в AI streaming endpoint")
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")
