import asyncio
import logging
from collections.abc import AsyncGenerator

from fastapi import HTTPException, Request
from sqlmodel import Session

from src.db.users import PublicUser
from src.services.ai.exceptions import (
    ActivityNotFoundError,
    AIProcessingError,
    AIServiceException,
    AITimeoutError,
    ChatSessionError,
    RetrievalError,
)
from src.services.ai.models import ErrorEvent
from src.services.ai.schemas.ai import (
    ActivityAIChatSessionResponse,
    SendActivityAIChatMessage,
    StartActivityAIChatSession,
)
from src.services.ai.service import run_activity_chat, run_activity_chat_stream
from src.services.ai.streaming import format_sse_message

logger = logging.getLogger(__name__)


def _map_ai_errors_to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, ActivityNotFoundError):
        return HTTPException(status_code=404, detail=exc.message)
    if isinstance(exc, AITimeoutError):
        return HTTPException(status_code=504, detail=exc.message)
    if isinstance(exc, (AIProcessingError, RetrievalError, ChatSessionError)):
        return HTTPException(
            status_code=500, detail=f"AI processing failed: {exc.message}"
        )
    return HTTPException(
        status_code=500,
        detail="An unexpected error occurred. Please try again later.",
    )


def _map_ai_error_to_sse(exc: Exception) -> str:
    if isinstance(exc, ActivityNotFoundError):
        return format_sse_message(
            ErrorEvent(error=exc.message, error_code=exc.error_code, status=404)
        )
    if isinstance(exc, AITimeoutError):
        return format_sse_message(
            ErrorEvent(error=exc.message, error_code=exc.error_code, status=504)
        )
    if isinstance(exc, (AIProcessingError, RetrievalError, ChatSessionError)):
        return format_sse_message(
            ErrorEvent(
                error=f"AI processing failed: {exc.message}",
                error_code=exc.error_code,
                status=500,
            )
        )
    return format_sse_message(
        ErrorEvent(
            error="An unexpected error occurred.",
            error_code="AI_INTERNAL_ERROR",
            status=500,
        )
    )


async def ai_start_activity_chat_session(
    request: Request,
    chat_session_object: StartActivityAIChatSession,
    current_user: PublicUser,
    db_session: Session,
    cancel_event: asyncio.Event | None = None,
) -> ActivityAIChatSessionResponse:
    try:
        return await run_activity_chat(
            activity_uuid=chat_session_object.activity_uuid,
            aichat_uuid=None,
            message=chat_session_object.message,
            db_session=db_session,
            user_id=current_user.id,
            locale=current_user.locale,
            request=request,
            cancel_event=cancel_event,
        )
    except (AIServiceException, HTTPException) as exc:
        if isinstance(exc, HTTPException):
            raise
        raise _map_ai_errors_to_http(exc) from exc
    except Exception as exc:
        logger.exception("Unexpected error in AI start: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again later.",
        ) from exc


async def ai_send_activity_chat_message(
    request: Request,
    chat_session_object: SendActivityAIChatMessage,
    current_user: PublicUser,
    db_session: Session,
    cancel_event: asyncio.Event | None = None,
) -> ActivityAIChatSessionResponse:
    try:
        return await run_activity_chat(
            activity_uuid=chat_session_object.activity_uuid,
            aichat_uuid=chat_session_object.aichat_uuid,
            message=chat_session_object.message,
            db_session=db_session,
            user_id=current_user.id,
            locale=current_user.locale,
            request=request,
            cancel_event=cancel_event,
        )
    except (AIServiceException, HTTPException) as exc:
        if isinstance(exc, HTTPException):
            raise
        raise _map_ai_errors_to_http(exc) from exc
    except Exception as exc:
        logger.exception("Unexpected error sending AI message: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again later.",
        ) from exc


async def ai_start_activity_chat_session_stream(
    request: Request,
    chat_session_object: StartActivityAIChatSession,
    current_user: PublicUser,
    db_session: Session,
    cancel_event: asyncio.Event | None = None,
) -> AsyncGenerator[str]:
    try:
        async for event in run_activity_chat_stream(
            activity_uuid=chat_session_object.activity_uuid,
            aichat_uuid=None,
            message=chat_session_object.message,
            db_session=db_session,
            user_id=current_user.id,
            locale=current_user.locale,
            request=request,
            cancel_event=cancel_event,
        ):
            yield format_sse_message(event)
    except AIServiceException as exc:
        yield _map_ai_error_to_sse(exc)
    except Exception as exc:
        logger.exception("Unexpected error in streaming AI chat: %s", exc)
        yield _map_ai_error_to_sse(exc)


async def ai_send_activity_chat_message_stream(
    request: Request,
    chat_session_object: SendActivityAIChatMessage,
    current_user: PublicUser,
    db_session: Session,
    cancel_event: asyncio.Event | None = None,
) -> AsyncGenerator[str]:
    try:
        async for event in run_activity_chat_stream(
            activity_uuid=chat_session_object.activity_uuid,
            aichat_uuid=chat_session_object.aichat_uuid,
            message=chat_session_object.message,
            db_session=db_session,
            user_id=current_user.id,
            locale=current_user.locale,
            request=request,
            cancel_event=cancel_event,
        ):
            yield format_sse_message(event)
    except AIServiceException as exc:
        yield _map_ai_error_to_sse(exc)
    except Exception as exc:
        logger.exception("Unexpected error in streaming AI chat: %s", exc)
        yield _map_ai_error_to_sse(exc)
