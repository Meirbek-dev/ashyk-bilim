from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, select

from src.auth.users import get_public_user
from src.db.ai_remediation import AIRemediationSession, AIRemediationSessionRead
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.ai.operations import run_remediation_generation

router = APIRouter(prefix="/remediation")


class RemediationRequest(PydanticStrictBaseModel):
    gate_mode: bool = False
    language: str = "auto"


class RemediationCompletionRequest(PydanticStrictBaseModel):
    score: int


@router.post("/{submission_uuid}/generate", response_model=AIRemediationSessionRead)
async def api_generate_remediation(
    submission_uuid: str,
    payload: RemediationRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AIRemediationSession:
    return await run_remediation_generation(
        db_session,
        submission_uuid,
        current_user,
        gate_mode=payload.gate_mode,
        language=payload.language,
    )


@router.get("/sessions/{session_uuid}", response_model=AIRemediationSessionRead)
async def api_get_remediation_session(
    session_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AIRemediationSession:
    session = db_session.exec(
        select(AIRemediationSession).where(AIRemediationSession.session_uuid == session_uuid)
    ).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сессия восполнения пробелов не найдена")
    return session


@router.get("/student/{student_user_id}", response_model=list[AIRemediationSessionRead])
async def api_list_student_remediation(
    student_user_id: int,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[AIRemediationSession]:
    return list(
        db_session.exec(
            select(AIRemediationSession)
            .where(AIRemediationSession.student_user_id == student_user_id)
            .order_by(col(AIRemediationSession.created_at).desc())
        ).all()
    )


@router.post("/sessions/{session_uuid}/complete", response_model=AIRemediationSessionRead)
async def api_complete_remediation(
    session_uuid: str,
    payload: RemediationCompletionRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AIRemediationSession:
    session = db_session.exec(
        select(AIRemediationSession).where(AIRemediationSession.session_uuid == session_uuid)
    ).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сессия восполнения пробелов не найдена")
    if session.student_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Невозможно завершить восполнение пробелов другого студента"
        )
    session.score = payload.score
    session.status = "passed" if payload.score >= 70 else "failed"
    if session.status == "passed":
        from src.db.ai_runtime import utc_now

        session.passed_at = utc_now()
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session
