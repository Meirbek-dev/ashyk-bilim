import asyncio
import logging
import time
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from enum import StrEnum
from threading import Lock
from typing import cast

from fastapi import HTTPException, Request
from pydantic_ai.messages import ModelMessage
from sqlmodel import Session

from config.config import get_settings
from src.db.courses.activities import ActivityRead
from src.db.courses.courses import CourseRead
from src.db.strict_base_model import is_str_list
from src.services.ai.agent import get_agent, get_model, get_model_settings
from src.services.ai.cache_manager import get_ai_cache_manager
from src.services.ai.exceptions import (
    ActivityNotFoundError,
    AIProcessingError,
    AITimeoutError,
    ContentModerationError,
    RetrievalError,
)
from src.services.ai.models import (
    AgentAnswer,
    AgentDependencies,
    DeltaEvent,
    FinalEvent,
    RetrievedChunk,
    StatusEvent,
)
from src.services.ai.moderation import moderate_text_input
from src.services.ai.retrieval import retrieve_chunks
from src.services.ai.schemas.ai import ActivityAIChatSessionResponse
from src.services.ai.session_store import (
    append_messages,
    build_chat_messages,
    load_chat_session,
)
from src.services.courses._utils import (
    _get_activity_by_uuid_or_404,
    _get_course_for_activity_or_404,
)
from src.services.courses.activities.utils import (
    serialize_activity_text_to_ai_comprehensible_text,
    structure_activity_content_by_type,
)

logger = logging.getLogger(__name__)

_ai_semaphore: asyncio.Semaphore | None = None
_ai_semaphore_size: int | None = None
_ai_semaphore_lock = Lock()

_TRANSLATION_HINTS = (
    "translate ",
    "translate to ",
    "перевести",
    "аудару",
)
_CRITIQUE_HINTS = ("critique ", "раскритикуй", "сынап")
_EDITORIAL_HINTS = (
    "write about ",
    "continue writing",
    "make this text longer",
    "написать о ",
    "продолжить писать",
    "ұзарту",
)
_INSTRUCTIONAL_HINTS = (
    "explain ",
    "summarize ",
    "give examples",
    "flashcards",
    "explain this",
    "объясните",
    "суммируйте",
    "приведите примеры",
    "түсіндір",
    "қорытынды",
    "мысал",
)

_STATUS_MESSAGES = {
    "en-US": {
        "processing": "Preparing your request.",
        "moderating": "Checking content safety.",
        "retrieving": "Retrieving relevant course context.",
        "analyzing": "Analyzing your request without additional retrieval.",
        "generating": "Generating the response.",
        "aborted": "Request cancelled.",
        "working": "Working on your request.",
    },
    "ru-RU": {
        "processing": "Подготавливаем ваш запрос.",
        "moderating": "Проверяем безопасность запроса.",
        "retrieving": "Подбираем релевантный контекст курса.",
        "analyzing": "Анализируем ваш запрос без дополнительного поиска.",
        "generating": "Формируем ответ.",
        "aborted": "Запрос отменён.",
        "working": "Обрабатываем ваш запрос.",
    },
    "kk-KZ": {
        "processing": "Сұрағыңызды дайындап жатырмыз.",
        "moderating": "Сұрау қауіпсіздігін тексеріп жатырмыз.",
        "retrieving": "Курс контекстін іздеп жатырмыз.",
        "analyzing": "Сұрағыңызды қосымша іздеусіз талдап жатырмыз.",
        "generating": "Жауапты құрастырып жатырмыз.",
        "aborted": "Сұрау тоқтатылды.",
        "working": "Сұрағыңызды өңдеп жатырмыз.",
    },
}
_DEFAULT_LOCALE = "ru-RU"
_REQUEST_LOCALE_HEADER = "x-locale"
_LOCALE_COOKIE_NAME = "NEXT_LOCALE"


class RequestMode(StrEnum):
    INSTRUCTIONAL = "instructional"
    EDITORIAL = "editorial"
    TRANSLATION = "translation"
    CRITIQUE = "critique"
    FOLLOW_UP = "follow_up"


@dataclass(frozen=True, slots=True)
class _ChatContext:
    activity: ActivityRead
    course: CourseRead
    documents: list[str]
    session_id: str
    session_history: list[ModelMessage]
    conversation_summary: str | None
    user_id: int | None
    request_id: str | None
    locale: str


@dataclass(frozen=True, slots=True)
class _RequestPolicy:
    mode: RequestMode
    retrieval_enabled: bool
    task_instruction: str | None = None


def _get_ai_semaphore(max_concurrent_requests: int) -> asyncio.Semaphore:
    global _ai_semaphore, _ai_semaphore_size
    size = max(1, max_concurrent_requests)
    if _ai_semaphore is not None and _ai_semaphore_size == size:
        return _ai_semaphore

    with _ai_semaphore_lock:
        if _ai_semaphore is None or _ai_semaphore_size != size:
            _ai_semaphore = asyncio.Semaphore(size)
            _ai_semaphore_size = size
        return _ai_semaphore


def _normalized_question(question: str) -> str:
    return " ".join(question.strip().lower().split())


def _documents_are_small(documents: list[str]) -> bool:
    return sum(len(document) for document in documents) <= 800


def _normalize_locale(locale: str | None) -> str:
    matched_locale = _match_locale(locale)
    if matched_locale:
        return matched_locale
    return _DEFAULT_LOCALE


def _match_locale(locale: str | None) -> str | None:
    normalized = (locale or "").strip().replace("_", "-")
    if not normalized:
        return None

    lowered = normalized.lower()
    if lowered.startswith("en"):
        return "en-US"
    if lowered.startswith("ru"):
        return "ru-RU"
    if lowered.startswith(("kk", "kz")):
        return "kk-KZ"
    return None


def _extract_request_locale(request: Request | None) -> str | None:
    if request is None:
        return None

    candidates = (
        request.headers.get(_REQUEST_LOCALE_HEADER),
        request.cookies.get(_LOCALE_COOKIE_NAME),
        request.headers.get("accept-language"),
    )
    for candidate in candidates:
        first_token = (candidate or "").split(",", 1)[0].split(";", 1)[0].strip()
        matched_locale = _match_locale(first_token)
        if matched_locale:
            return matched_locale

    return None


def _detect_request_mode(question: str, *, has_session_history: bool) -> RequestMode:
    normalized = _normalized_question(question)

    if normalized.startswith(_TRANSLATION_HINTS):
        return RequestMode.TRANSLATION

    if normalized.startswith(_CRITIQUE_HINTS):
        return RequestMode.CRITIQUE

    if normalized.startswith(_EDITORIAL_HINTS):
        return RequestMode.EDITORIAL

    if normalized.startswith(_INSTRUCTIONAL_HINTS):
        return RequestMode.INSTRUCTIONAL

    if has_session_history and len(normalized) <= 120:
        return RequestMode.FOLLOW_UP

    return RequestMode.INSTRUCTIONAL


def _build_request_policy(ctx: _ChatContext, question: str) -> _RequestPolicy:
    mode = _detect_request_mode(question, has_session_history=bool(ctx.session_history))

    if mode == RequestMode.TRANSLATION:
        return _RequestPolicy(
            mode=mode,
            retrieval_enabled=False,
            task_instruction="Используйте предоставленный пользователем текст как основной источник. Сохраняйте структуру и не добавляйте лишний контент.",
        )

    if mode == RequestMode.CRITIQUE:
        return _RequestPolicy(
            mode=mode,
            retrieval_enabled=False,
            task_instruction="Сосредоточьтесь на точной критике и предложениях по правке текста из сообщения пользователя.",
        )

    if mode == RequestMode.EDITORIAL:
        return _RequestPolicy(
            mode=mode,
            retrieval_enabled=False,
            task_instruction="Сосредоточьтесь на качестве текста, ясности и связности на основе предоставленного пользователем текста.",
        )

    if mode == RequestMode.FOLLOW_UP:
        return _RequestPolicy(
            mode=mode,
            retrieval_enabled=False,
            task_instruction="Сначала используйте недавний контекст разговора. Обращайтесь к общим знаниям только если недавнего обмена недостаточно.",
        )

    if _documents_are_small(ctx.documents) and len(question.strip()) <= 80:
        return _RequestPolicy(
            mode=mode,
            retrieval_enabled=False,
            task_instruction="Контекст активности небольшой. Сначала опирайтесь на предоставленный запрос и недавний контекст, прежде чем переходить к поиску.",
        )

    return _RequestPolicy(mode=mode, retrieval_enabled=True)


def _status_message(status: str, *, retrieval_enabled: bool, locale: str) -> str:
    messages = _STATUS_MESSAGES.get(_normalize_locale(locale), _STATUS_MESSAGES[_DEFAULT_LOCALE])

    if status == "processing":
        return messages["processing"]
    if status == "moderating":
        return messages["moderating"]
    if status == "retrieving":
        return messages["retrieving"]
    if status == "analyzing":
        return messages["analyzing"]
    if status == "generating":
        return messages["generating"]
    if status == "aborted":
        return messages["aborted"]
    if not retrieval_enabled:
        return messages["working"]
    return messages["working"]


async def _retrieve_chunks_for_policy(
    *,
    ctx: _ChatContext,
    question: str,
    embedding_model_name: str,
    retrieval_enabled: bool,
) -> tuple[list[RetrievedChunk], float]:
    if not retrieval_enabled:
        return [], 0.0

    started_at = time.perf_counter()
    try:
        retrieved_chunks = await retrieve_chunks(
            query=question.strip(),
            documents=ctx.documents,
            embedding_model_name=embedding_model_name,
            collection_name=f"activity_{ctx.activity.activity_uuid}",
        )
    except RetrievalError as exc:
        logger.warning(
            "Извлечение контекста AI недоступно для активности %s; продолжаем без найденного контекста: %s",
            ctx.activity.activity_uuid,
            exc.message,
            exc_info=exc,
        )
        return [], (time.perf_counter() - started_at) * 1000

    return retrieved_chunks, (time.perf_counter() - started_at) * 1000


async def _get_activity_data(
    activity_uuid: str,
    db_session: Session,
) -> tuple[ActivityRead, CourseRead]:
    cache_manager = get_ai_cache_manager()
    cache_key = f"activity_{activity_uuid}"
    cached_pair = cache_manager.db_cache.get(cache_key)
    if cached_pair:
        logger.info("Кэш данных активности: HIT %s", activity_uuid)
        return cast("tuple[ActivityRead, CourseRead]", cached_pair)

    try:
        activity = _get_activity_by_uuid_or_404(activity_uuid, db_session)
        course = _get_course_for_activity_or_404(activity, db_session)

        cache_manager.db_cache.set(cache_key, (activity, course))
        return cast("ActivityRead", activity), cast("CourseRead", course)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise ActivityNotFoundError(activity_uuid) from exc
        raise
    except Exception as exc:
        raise ActivityNotFoundError(
            activity_uuid,
            details={"error": str(exc), "type": type(exc).__name__},
        ) from exc


async def _get_documents(
    activity_uuid: str,
    activity: ActivityRead,
    course: CourseRead,
) -> list[str]:
    cache_manager = get_ai_cache_manager()
    context_text_key = f"context_text_{activity_uuid}"
    cached_documents = cache_manager.db_cache.get(context_text_key)
    if cached_documents:
        logger.debug("Кэш текста контекста: HIT %s", activity_uuid)
        if is_str_list(cached_documents):
            return cached_documents
        logger.warning("Кэш текста контекста содержит неожиданный тип: %s", type(cached_documents).__name__)

    structured = await asyncio.to_thread(
        structure_activity_content_by_type,
        activity.content,
    )
    ai_text = serialize_activity_text_to_ai_comprehensible_text(
        structured,
        course,
        activity,
        is_activity_empty=not structured,
    )
    documents = structured or [ai_text]
    cache_manager.db_cache.set(context_text_key, documents)
    logger.debug("Кэш текста контекста: MISS %s — сохранено", activity_uuid)
    return documents


async def build_chat_context(
    *,
    activity_uuid: str,
    aichat_uuid: str | None,
    db_session: Session,
    user_id: int | None,
    locale: str | None,
    request: Request | None,
) -> _ChatContext:
    activity, course = await _get_activity_data(activity_uuid, db_session)
    documents = await _get_documents(activity_uuid, activity, course)
    session_window = await asyncio.to_thread(load_chat_session, aichat_uuid, user_id)
    request_id = request.headers.get("x-request-id") if request else None
    resolved_locale = _extract_request_locale(request) or _match_locale(locale) or _DEFAULT_LOCALE

    return _ChatContext(
        activity=activity,
        course=course,
        documents=documents,
        session_id=session_window.session_id,
        session_history=session_window.to_model_messages(),
        conversation_summary=session_window.conversation_summary,
        user_id=user_id,
        request_id=request_id,
        locale=resolved_locale,
    )


def _build_agent_deps(
    ctx: _ChatContext,
    policy: _RequestPolicy,
    retrieved_chunks: list[RetrievedChunk],
) -> AgentDependencies:
    return AgentDependencies(
        activity_uuid=ctx.activity.activity_uuid,
        activity_name=ctx.activity.name,
        course_name=ctx.course.name,
        session_id=ctx.session_id,
        user_id=ctx.user_id,
        request_id=ctx.request_id,
        request_mode=policy.mode.value,
        task_instruction=policy.task_instruction,
        conversation_summary=ctx.conversation_summary,
        retrieved_chunks=retrieved_chunks,
    )


async def generate_chat_answer(
    *,
    ctx: _ChatContext,
    question: str,
    cancel_event: asyncio.Event | None = None,
) -> AgentAnswer:
    if not question or not question.strip():
        msg = "Вопрос не может быть пустым"
        raise AIProcessingError(msg)

    settings = get_settings().ai_config
    timeout_seconds = settings.request_timeout

    if cancel_event and cancel_event.is_set():
        msg = "Обработка AI отменена до запуска"
        raise AIProcessingError(msg)

    try:
        async with asyncio.timeout(timeout_seconds):
            await moderate_text_input(question, stage="input")
            policy = _build_request_policy(ctx, question)
            logger.info(
                "Политика AI-запроса: session=%s mode=%s retrieval=%s summary=%s question_chars=%d",
                ctx.session_id,
                policy.mode.value,
                policy.retrieval_enabled,
                bool(ctx.conversation_summary),
                len(question.strip()),
            )
            retrieved_chunks, retrieval_ms = await _retrieve_chunks_for_policy(
                ctx=ctx,
                question=question,
                embedding_model_name=settings.embedding_model,
                retrieval_enabled=policy.retrieval_enabled,
            )
            if policy.retrieval_enabled:
                logger.info(
                    "Извлечение контекста AI завершено: session=%s chunks=%d duration_ms=%.1f",
                    ctx.session_id,
                    len(retrieved_chunks),
                    retrieval_ms,
                )

            deps = _build_agent_deps(ctx, policy, retrieved_chunks)
            async with _get_ai_semaphore(settings.max_concurrent_requests):
                result = await get_agent().run(
                    question.strip(),
                    deps=deps,
                    model=get_model(),
                    model_settings=get_model_settings(),
                    message_history=ctx.session_history,
                )
    except TimeoutError as exc:
        raise AITimeoutError(timeout_seconds, details={"activity_uuid": ctx.activity.activity_uuid}) from exc
    except ActivityNotFoundError:
        raise
    except AITimeoutError, ContentModerationError, RetrievalError:
        raise
    except Exception as exc:
        msg = f"Непредвиденная ошибка при обработке AI: {exc!s}"
        raise AIProcessingError(
            msg,
            details={"error_type": type(exc).__name__, "session_id": ctx.session_id},
        ) from exc

    output = result.output.strip()
    if not output:
        msg_0 = "AI вернул пустой ответ"
        raise AIProcessingError(msg_0)

    append_messages(
        ctx.session_id,
        build_chat_messages(
            question=question.strip(),
            answer=output,
            activity_uuid=ctx.activity.activity_uuid,
            user_id=ctx.user_id,
            request_id=ctx.request_id,
        ),
    )

    model_response = result.all_messages()[-1] if result.all_messages() else None
    finish_reason = getattr(model_response, "finish_reason", None)
    model_name = getattr(model_response, "model_name", None)
    return AgentAnswer(
        message=output,
        chunk_count=len(retrieved_chunks),
        finish_reason=None if finish_reason is None else str(finish_reason),
        model_name=model_name,
    )


async def stream_chat_answer(
    *,
    ctx: _ChatContext,
    question: str,
    cancel_event: asyncio.Event | None = None,
) -> AsyncGenerator[StatusEvent | DeltaEvent | FinalEvent]:
    if not question or not question.strip():
        msg = "Вопрос не может быть пустым"
        raise AIProcessingError(msg)

    settings = get_settings().ai_config
    timeout_seconds = settings.request_timeout

    yield StatusEvent(
        status="processing",
        aichat_uuid=ctx.session_id,
        activity_uuid=ctx.activity.activity_uuid,
        message=_status_message("processing", retrieval_enabled=True, locale=ctx.locale),
    )

    try:
        async with asyncio.timeout(timeout_seconds):
            yield StatusEvent(  # noqa: ASYNC119
                status="moderating",
                aichat_uuid=ctx.session_id,
                activity_uuid=ctx.activity.activity_uuid,
                message=_status_message("moderating", retrieval_enabled=True, locale=ctx.locale),
            )
            await moderate_text_input(question, stage="input")
            policy = _build_request_policy(ctx, question)
            logger.info(
                "Политика потокового AI-запроса: session=%s mode=%s retrieval=%s summary=%s question_chars=%d",
                ctx.session_id,
                policy.mode.value,
                policy.retrieval_enabled,
                bool(ctx.conversation_summary),
                len(question.strip()),
            )

            retrieved_chunks: list[RetrievedChunk]
            if policy.retrieval_enabled:
                yield StatusEvent(  # noqa: ASYNC119
                    status="retrieving",
                    aichat_uuid=ctx.session_id,
                    activity_uuid=ctx.activity.activity_uuid,
                    message=_status_message("retrieving", retrieval_enabled=True, locale=ctx.locale),
                )
                retrieved_chunks, retrieval_ms = await _retrieve_chunks_for_policy(
                    ctx=ctx,
                    question=question,
                    embedding_model_name=settings.embedding_model,
                    retrieval_enabled=True,
                )
                logger.info(
                    "Потоковое извлечение контекста AI завершено: session=%s chunks=%d duration_ms=%.1f",
                    ctx.session_id,
                    len(retrieved_chunks),
                    retrieval_ms,
                )
            else:
                yield StatusEvent(  # noqa: ASYNC119
                    status="analyzing",
                    aichat_uuid=ctx.session_id,
                    activity_uuid=ctx.activity.activity_uuid,
                    message=_status_message("analyzing", retrieval_enabled=False, locale=ctx.locale),
                )
                retrieved_chunks = list[RetrievedChunk]()

            deps = _build_agent_deps(ctx, policy, retrieved_chunks)

            yield StatusEvent(  # noqa: ASYNC119
                status="generating",
                aichat_uuid=ctx.session_id,
                activity_uuid=ctx.activity.activity_uuid,
                message=_status_message(
                    "generating",
                    retrieval_enabled=policy.retrieval_enabled,
                    locale=ctx.locale,
                ),
            )

            full_response = ""
            chunk_id = 0
            async with (
                _get_ai_semaphore(settings.max_concurrent_requests),
                get_agent().run_stream(
                    question.strip(),
                    deps=deps,
                    model=get_model(),
                    model_settings=get_model_settings(),
                    message_history=ctx.session_history,
                ) as result,
            ):
                async for delta in result.stream_text(delta=True, debounce_by=None):
                    if cancel_event and cancel_event.is_set():
                        yield StatusEvent(  # noqa: ASYNC119
                            status="aborted",
                            aichat_uuid=ctx.session_id,
                            activity_uuid=ctx.activity.activity_uuid,
                            message=_status_message(
                                "aborted",
                                retrieval_enabled=policy.retrieval_enabled,
                                locale=ctx.locale,
                            ),
                        )
                        return

                    if not delta:
                        continue
                    chunk_id += 1
                    full_response += delta
                    yield DeltaEvent(content=delta, chunk_id=chunk_id)  # noqa: ASYNC119

                output = (await result.get_output()).strip()
                if output and output != full_response:
                    full_response = output

    except TimeoutError as exc:
        raise AITimeoutError(timeout_seconds, details={"activity_uuid": ctx.activity.activity_uuid}) from exc
    except AITimeoutError, ContentModerationError:
        raise
    except Exception as exc:
        msg = f"Непредвиденная ошибка при потоковой обработке AI: {exc!s}"
        raise AIProcessingError(
            msg,
            details={"error_type": type(exc).__name__, "session_id": ctx.session_id},
        ) from exc

    if not full_response:
        msg_0 = "AI вернул пустой ответ"
        raise AIProcessingError(msg_0)

    append_messages(
        ctx.session_id,
        build_chat_messages(
            question=question.strip(),
            answer=full_response,
            activity_uuid=ctx.activity.activity_uuid,
            user_id=ctx.user_id,
            request_id=ctx.request_id,
        ),
    )

    yield FinalEvent(
        content=full_response,
        aichat_uuid=ctx.session_id,
        activity_uuid=ctx.activity.activity_uuid,
        chunk_count=chunk_id,
    )


async def run_activity_chat(
    *,
    activity_uuid: str,
    aichat_uuid: str | None,
    message: str,
    db_session: Session,
    user_id: int | None,
    locale: str | None,
    request: Request | None,
    cancel_event: asyncio.Event | None = None,
) -> ActivityAIChatSessionResponse:
    trace_start = time.perf_counter()
    ctx = await build_chat_context(
        activity_uuid=activity_uuid,
        aichat_uuid=aichat_uuid,
        db_session=db_session,
        user_id=user_id,
        locale=locale,
        request=request,
    )
    answer = await generate_chat_answer(ctx=ctx, question=message, cancel_event=cancel_event)
    logger.info(
        "AI-чат %s завершён за %.1f мс",
        ctx.session_id,
        (time.perf_counter() - trace_start) * 1000,
    )
    return ActivityAIChatSessionResponse(
        aichat_uuid=ctx.session_id,
        activity_uuid=ctx.activity.activity_uuid,
        message=answer.message,
    )


async def run_activity_chat_stream(
    *,
    activity_uuid: str,
    aichat_uuid: str | None,
    message: str,
    db_session: Session,
    user_id: int | None,
    locale: str | None,
    request: Request | None,
    cancel_event: asyncio.Event | None = None,
) -> AsyncGenerator[StatusEvent | DeltaEvent | FinalEvent]:
    ctx = await build_chat_context(
        activity_uuid=activity_uuid,
        aichat_uuid=aichat_uuid,
        db_session=db_session,
        user_id=user_id,
        locale=locale,
        request=request,
    )
    async for event in stream_chat_answer(
        ctx=ctx,
        question=message,
        cancel_event=cancel_event,
    ):
        yield event
