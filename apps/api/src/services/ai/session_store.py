import json
import logging
from threading import Lock

from redis import Redis
from ulid import ULID

from config.config import get_settings
from src.core.platform import PLATFORM_CHAT_KEY_PREFIX
from src.services.ai.exceptions import ChatSessionError
from src.services.ai.models import (
    ChatMessage,
    ChatMessageMetadata,
    ChatRole,
    ChatSessionWindow,
)

logger = logging.getLogger(__name__)

_redis_client: Redis | None = None
_redis_lock = Lock()
_SUMMARY_SOURCE_MESSAGE_COUNT = 6
_SUMMARY_CONTENT_LIMIT = 180


def _session_id(aichat_uuid: str | None, user_id: int | None) -> str:
    if aichat_uuid and user_id is not None:
        if aichat_uuid.startswith("user_") and not aichat_uuid.startswith(
            f"user_{user_id}_"
        ):
            raise ChatSessionError(
                "Session does not belong to this user",
                details={"session": aichat_uuid},
            )
        return aichat_uuid
    if aichat_uuid:
        return aichat_uuid
    if user_id is not None:
        return f"user_{user_id}_{ULID()}"
    return f"aichat_{ULID()}"


def _redis_key(session_id: str) -> str:
    return f"{PLATFORM_CHAT_KEY_PREFIX}{session_id}"


def _get_redis_client() -> Redis | None:
    global _redis_client
    if _redis_client is None:
        with _redis_lock:
            if _redis_client is None:
                connection_string = get_settings().redis_config.redis_connection_string
                try:
                    client = Redis.from_url(connection_string, decode_responses=True)
                    client.ping()
                    _redis_client = client
                except Exception as exc:
                    logger.warning("Redis unavailable for AI session store: %s", exc)
                    _redis_client = None
    return _redis_client


def _truncate_message_content(content: str) -> str:
    compact = " ".join(content.split())
    if len(compact) <= _SUMMARY_CONTENT_LIMIT:
        return compact
    return f"{compact[:_SUMMARY_CONTENT_LIMIT].rstrip()}..."


def _summarize_messages(messages: list[ChatMessage]) -> str | None:
    if not messages:
        return None

    summary_lines = []
    for message in messages:
        role = "User" if message.role == ChatRole.USER else "Assistant"
        summary_lines.append(f"{role}: {_truncate_message_content(message.content)}")

    return "\n".join(summary_lines)


def load_chat_session(
    aichat_uuid: str | None = None,
    user_id: int | None = None,
) -> ChatSessionWindow:
    session_id = _session_id(aichat_uuid, user_id)
    settings = get_settings()
    window_size = settings.ai_config.history_window_size
    storage_type = "memory"
    messages: list[ChatMessage] = []
    total_messages = 0
    conversation_summary: str | None = None

    client = _get_redis_client()
    if client is not None:
        storage_type = "redis"
        key = _redis_key(session_id)
        try:
            total_messages = client.llen(key)
            raw_messages = client.lrange(key, -window_size, -1)
            messages = [ChatMessage.model_validate_json(item) for item in raw_messages]

            older_message_count = max(total_messages - len(messages), 0)
            if older_message_count > 0:
                older_end = older_message_count - 1
                older_start = max(0, older_end - _SUMMARY_SOURCE_MESSAGE_COUNT + 1)
                raw_summary_messages = client.lrange(key, older_start, older_end)
                summary_messages = [
                    ChatMessage.model_validate_json(item)
                    for item in raw_summary_messages
                ]
                conversation_summary = _summarize_messages(summary_messages)
        except Exception as exc:
            msg = f"Failed to load chat session: {exc!s}"
            raise ChatSessionError(
                msg,
                details={"session_id": session_id, "error_type": type(exc).__name__},
            ) from exc

    return ChatSessionWindow(
        session_id=session_id,
        messages=messages,
        total_messages=total_messages,
        window_size=window_size,
        storage_type=storage_type,
        conversation_summary=conversation_summary,
    )


def append_messages(
    session_id: str,
    messages: list[ChatMessage],
) -> None:
    if not messages:
        return

    settings = get_settings()
    client = _get_redis_client()
    if client is None:
        logger.warning(
            "Redis unavailable, AI chat persistence disabled for session %s", session_id
        )
        return

    key = _redis_key(session_id)
    payloads = [message.model_dump_json() for message in messages]

    try:
        pipe = client.pipeline()
        pipe.rpush(key, *payloads)
        pipe.expire(key, settings.ai_config.message_retention)
        if settings.ai_config.max_history_length > 0:
            pipe.ltrim(key, -settings.ai_config.max_history_length, -1)
        pipe.execute()
    except Exception as exc:
        msg = f"Failed to persist chat session: {exc!s}"
        raise ChatSessionError(
            msg,
            details={"session_id": session_id, "error_type": type(exc).__name__},
        ) from exc


def build_chat_messages(
    *,
    question: str,
    answer: str,
    activity_uuid: str,
    user_id: int | None,
    request_id: str | None,
) -> list[ChatMessage]:
    metadata = ChatMessageMetadata(
        activity_uuid=activity_uuid,
        user_id=user_id,
        request_id=request_id,
    )
    return [
        ChatMessage(
            id=str(ULID()), role=ChatRole.USER, content=question, metadata=metadata
        ),
        ChatMessage(
            id=str(ULID()), role=ChatRole.ASSISTANT, content=answer, metadata=metadata
        ),
    ]
