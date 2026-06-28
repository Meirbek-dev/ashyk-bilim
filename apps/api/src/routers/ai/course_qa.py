from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from src.auth.users import get_public_user
from src.db.ai_qa_thread import AIQAMessage, AIQAMessageRead
from src.db.ai_runtime import AIThread
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.ai.operations import ask_course_question
from src.services.courses.courses import _get_course_by_uuid  # pyright: ignore[reportPrivateUsage]

router = APIRouter(prefix="/qa")


class CourseQARequest(PydanticStrictBaseModel):
    question: str
    thread_uuid: str | None = None
    role: str = "student"
    language: str = "auto"


class CourseQAResponse(PydanticStrictBaseModel):
    thread_uuid: str
    user_message: AIQAMessageRead
    assistant_message: AIQAMessageRead


@router.post("/{course_uuid}/ask", response_model=CourseQAResponse)
async def api_ask_course_question(
    course_uuid: str,
    payload: CourseQARequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> CourseQAResponse:
    thread, user_message, assistant_message = await ask_course_question(
        db_session,
        course_uuid,
        current_user,
        question=payload.question,
        thread_uuid=payload.thread_uuid,
        role=payload.role,
        language=payload.language,
    )
    return CourseQAResponse(
        thread_uuid=thread.thread_uuid,
        user_message=AIQAMessageRead.model_validate(user_message),
        assistant_message=AIQAMessageRead.model_validate(assistant_message),
    )


@router.get("/{course_uuid}/threads", response_model=list[AIQAMessageRead])
async def api_list_course_qa_threads(
    course_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[AIQAMessage]:
    course = _get_course_by_uuid(db_session, course_uuid)
    if course is None or course.id is None:
        return []
    return list(
        db_session.exec(
            select(AIQAMessage)
            .where(AIQAMessage.course_id == course.id, AIQAMessage.user_id == current_user.id)
            .order_by(col(AIQAMessage.created_at).desc())
        ).all()
    )


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Q&A thread not found")
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Q&A thread not found")
    db_session.delete(thread)
    db_session.commit()
