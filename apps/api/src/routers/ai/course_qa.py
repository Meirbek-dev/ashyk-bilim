import json
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlmodel import Session, col, select

from src.auth.users import get_public_user
from src.db.ai_qa_thread import AIQAMessage, AIQAMessageRead
from src.db.ai_runtime import AIThread
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.ai.operations import (
    get_course_question_replay,
    prepare_course_question_stream,
    stream_course_question_events,
)
from src.services.ai.policy import require_ai_course_read
from src.services.courses.courses import _get_course_by_uuid  # pyright: ignore[reportPrivateUsage]

router = APIRouter(prefix="/qa")


class AIQAThreadSummaryRead(PydanticStrictBaseModel):
    thread_uuid: str
    title: str | None = None
    last_message_preview: str
    message_count: int
    updated_at: datetime


# --- AG-UI wire contract (RunAgentInput) -----------------------------------
# Field names here are camelCase because they mirror the AG-UI protocol wire
# format sent by `@tanstack/ai-client`'s `fetchServerSentEvents` connection
# adapter, not this codebase's normal snake_case API convention. Do not rename
# these to match repo style — they must match the wire format byte-for-byte.
class CourseQAWireMessage(PydanticStrictBaseModel):
    id: str | None = None
    role: str
    content: str | None = None
    parts: list[dict[str, object]] | None = None


class CourseQAChatRequest(PydanticStrictBaseModel):
    threadId: str  # ruff: ignore[mixed-case-variable-in-class-scope]
    runId: str  # ruff: ignore[mixed-case-variable-in-class-scope]
    messages: list[CourseQAWireMessage] = Field(default_factory=list)
    forwardedProps: dict[str, object] = Field(default_factory=dict)  # ruff: ignore[mixed-case-variable-in-class-scope]


def _latest_user_question(messages: list[CourseQAWireMessage]) -> str | None:
    for message in reversed(messages):
        if message.role != "user":
            continue
        if message.content:
            return message.content
        if message.parts:
            text = "".join(str(part.get("content") or "") for part in message.parts if part.get("type") == "text")
            if text:
                return text
    return None


@router.post("/{course_uuid}/chat", response_class=StreamingResponse)
async def api_stream_course_question(
    course_uuid: str,
    payload: CourseQAChatRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    """AG-UI-compatible chat transport for course Q&A, consumed by `useChat`.

    Auth, budget checks, and thread/message persistence all happen eagerly
    below (before the stream starts) so they surface as a normal HTTP error
    status; only the model call and final persistence happen inside the
    generator, where failures become a RUN_ERROR event instead.
    """
    question = _latest_user_question(payload.messages)
    if not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="COURSE_QA_USER_MESSAGE_REQUIRED",
        )

    forwarded = payload.forwardedProps
    thread_uuid = forwarded.get("thread_uuid")
    thread_uuid = thread_uuid if isinstance(thread_uuid, str) and thread_uuid else None
    language = forwarded.get("language")
    language = language if isinstance(language, str) and language else "auto"
    activity_uuid = forwarded.get("activity_uuid")
    activity_uuid = activity_uuid if isinstance(activity_uuid, str) and activity_uuid else None
    client_turn_id = forwarded.get("client_turn_id")
    client_turn_id = client_turn_id if isinstance(client_turn_id, str) and client_turn_id else None

    replay = (
        get_course_question_replay(
            db_session,
            course_uuid,
            current_user,
            client_turn_id=client_turn_id,
            question=question,
        )
        if client_turn_id
        else None
    )

    if replay is not None:
        replay_thread, _, replay_assistant = replay

        async def replay_stream() -> AsyncIterator[str]:
            message_id = replay_assistant.message_uuid
            events: list[dict[str, object]] = [
                {"type": "RUN_STARTED", "threadId": payload.threadId, "runId": payload.runId},
                {"type": "TEXT_MESSAGE_START", "messageId": message_id, "role": "assistant"},
                {"type": "TEXT_MESSAGE_CONTENT", "messageId": message_id, "delta": replay_assistant.content},
                {"type": "TEXT_MESSAGE_END", "messageId": message_id},
                {
                    "type": "RUN_FINISHED",
                    "threadId": payload.threadId,
                    "runId": payload.runId,
                    "result": {
                        "thread_uuid": replay_thread.thread_uuid,
                        "message_uuid": replay_assistant.message_uuid,
                        "replayed": True,
                    },
                },
            ]
            for event in events:
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        return StreamingResponse(replay_stream(), media_type="text/event-stream")

    session = prepare_course_question_stream(
        db_session,
        course_uuid,
        current_user,
        question=question,
        thread_uuid=thread_uuid,
        language=language,
        activity_uuid=activity_uuid,
        client_turn_id=client_turn_id,
    )

    async def event_stream() -> AsyncIterator[str]:
        async for event in stream_course_question_events(
            db_session,
            session,
            thread_id=payload.threadId,
            run_id=payload.runId,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/{course_uuid}/threads", response_model=list[AIQAThreadSummaryRead])
async def api_list_course_qa_threads(
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=50)] = 30,
) -> list[AIQAThreadSummaryRead]:
    course = _get_course_by_uuid(db_session, course_uuid)
    if course is None or course.id is None:
        return []
    require_ai_course_read(db_session, course, current_user)

    threads = list(
        db_session.exec(
            select(AIThread)
            .where(AIThread.course_id == course.id, AIThread.user_id == current_user.id)
            .order_by(col(AIThread.updated_at).desc())
            .limit(limit)
        ).all()
    )
    thread_ids = [thread.id for thread in threads if thread.id is not None]
    messages_by_thread: dict[int, list[AIQAMessage]] = {thread_id: [] for thread_id in thread_ids}
    if thread_ids:
        messages = db_session.exec(
            select(AIQAMessage)
            .where(col(AIQAMessage.thread_id).in_(thread_ids))
            .order_by(col(AIQAMessage.created_at).desc())
        ).all()
        for message in messages:
            messages_by_thread.setdefault(message.thread_id, []).append(message)
    summaries: list[AIQAThreadSummaryRead] = []
    for thread in threads:
        if thread.id is None:
            continue
        messages = messages_by_thread.get(thread.id, [])
        if not messages:
            continue
        last_message = messages[0]
        summaries.append(
            AIQAThreadSummaryRead(
                thread_uuid=thread.thread_uuid,
                title=thread.title,
                last_message_preview=last_message.content[:140],
                message_count=len(messages),
                updated_at=thread.updated_at,
            )
        )
    return summaries


@router.get("/{course_uuid}/threads/{thread_uuid}", response_model=list[AIQAMessageRead])
async def api_get_course_qa_thread(
    course_uuid: str,
    thread_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[AIQAMessage]:
    thread = db_session.exec(
        select(AIThread).where(AIThread.thread_uuid == thread_uuid, AIThread.user_id == current_user.id)
    ).first()
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI_THREAD_NOT_FOUND")
    course = _get_course_by_uuid(db_session, course_uuid)
    if course is None or course.id is None or thread.course_id != course.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI_THREAD_NOT_FOUND")
    require_ai_course_read(db_session, course, current_user)
    return list(
        db_session.exec(
            select(AIQAMessage).where(AIQAMessage.thread_id == thread.id).order_by(col(AIQAMessage.created_at))
        ).all()
    )


@router.delete("/{course_uuid}/threads/{thread_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_course_qa_thread(
    course_uuid: str,
    thread_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> None:
    thread = db_session.exec(
        select(AIThread).where(AIThread.thread_uuid == thread_uuid, AIThread.user_id == current_user.id)
    ).first()
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI_THREAD_NOT_FOUND")
    course = _get_course_by_uuid(db_session, course_uuid)
    if course is None or course.id is None or thread.course_id != course.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI_THREAD_NOT_FOUND")
    require_ai_course_read(db_session, course, current_user)
    db_session.delete(thread)
    db_session.commit()
