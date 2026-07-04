import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlmodel import Session, col, select

from src.auth.users import get_public_user
from src.db.ai_runtime import AIArtifactRecord, AIEvent, AIRun, AIRunStatus
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.ai.policy import require_ai_run_access

router = APIRouter(prefix="/runs")


class AIRunStatusRead(PydanticStrictBaseModel):
    run_uuid: str
    status: str
    model_name: str | None = None
    error_code: str | None = None
    run_metadata: dict[str, object] = Field(default_factory=dict)


class AIRunEventRead(PydanticStrictBaseModel):
    event_id: str
    event_type: str
    sequence: int
    payload_json: dict[str, object]


class AIArtifactRead(PydanticStrictBaseModel):
    artifact_uuid: str
    kind: str
    content_json: dict[str, object]
    final: bool


def _run_or_404(db_session: Session, run_uuid: str) -> AIRun:
    run = db_session.exec(select(AIRun).where(AIRun.run_uuid == run_uuid)).first()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запуск ИИ не найден")
    return run


def _run_events(db_session: Session, run: AIRun) -> list[AIEvent]:
    assert run.id is not None
    return list(db_session.exec(select(AIEvent).where(AIEvent.run_id == run.id).order_by(col(AIEvent.sequence))).all())


TERMINAL_STATUSES = {AIRunStatus.FINISHED.value, AIRunStatus.ERROR.value, AIRunStatus.ABORTED.value}


def _stream_payload(event: AIEvent) -> dict[str, object]:
    payload: dict[str, object] = dict(event.payload_json or {})
    state = payload.get("state")
    if not isinstance(state, str):
        state = {
            "running": "running",
            "queued": "queued",
            "finished": "complete",
            "failed": "failed",
            "aborted": "cancelled",
        }.get(event.event_type, "running")
    return {
        "state": state,
        "message": payload.get("message"),
        "payload": payload,
    }


@router.get("/{run_uuid}", response_model=AIRunStatusRead)
async def api_get_ai_run(
    run_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AIRun:
    run = _run_or_404(db_session, run_uuid)
    require_ai_run_access(db_session, run, current_user)
    return run


@router.get("/{run_uuid}/events", response_model=list[AIRunEventRead])
async def api_get_ai_run_events(
    run_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[AIEvent]:
    run = _run_or_404(db_session, run_uuid)
    require_ai_run_access(db_session, run, current_user)
    return _run_events(db_session, run)


@router.get("/{run_uuid}/artifacts", response_model=list[AIArtifactRead])
async def api_get_ai_run_artifacts(
    run_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[AIArtifactRecord]:
    run = _run_or_404(db_session, run_uuid)
    require_ai_run_access(db_session, run, current_user)
    assert run.id is not None
    return list(
        db_session.exec(
            select(AIArtifactRecord)
            .where(AIArtifactRecord.run_id == run.id)
            .order_by(col(AIArtifactRecord.created_at).desc())
        ).all()
    )


@router.get("/{run_uuid}/stream", response_class=StreamingResponse)
async def api_stream_ai_run_events(
    run_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    run = _run_or_404(db_session, run_uuid)
    require_ai_run_access(db_session, run, current_user)

    async def iter_events() -> AsyncIterator[str]:
        last_sequence = 0
        while True:
            db_session.expire_all()
            fresh_run = _run_or_404(db_session, run_uuid)
            events = db_session.exec(
                select(AIEvent)
                .where(AIEvent.run_id == fresh_run.id, AIEvent.sequence > last_sequence)
                .order_by(col(AIEvent.sequence))
            ).all()
            for event in events:
                last_sequence = max(last_sequence, event.sequence)
                yield f"data: {json.dumps(_stream_payload(event), ensure_ascii=False)}\n\n"
            if fresh_run.status in TERMINAL_STATUSES:
                break
            await asyncio.sleep(1)

    return StreamingResponse(iter_events(), media_type="text/event-stream")


@router.post("/{run_uuid}/cancel", response_model=AIRunStatusRead)
async def api_cancel_ai_run(
    run_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AIRun:
    run = _run_or_404(db_session, run_uuid)
    require_ai_run_access(db_session, run, current_user)
    if run.status in {AIRunStatus.FINISHED.value, AIRunStatus.ERROR.value, AIRunStatus.ABORTED.value}:
        return run
    from src.db.ai_runtime import utc_now

    run.status = AIRunStatus.ABORTED.value
    run.completed_at = utc_now()
    db_session.add(run)
    assert run.id is not None
    next_sequence = (
        db_session.exec(
            select(col(AIEvent.sequence)).where(AIEvent.run_id == run.id).order_by(col(AIEvent.sequence).desc())
        ).first()
        or 0
    ) + 1
    db_session.add(
        AIEvent(
            run_id=run.id,
            event_id=f"event_cancel_{run.run_uuid}",
            event_type="aborted",
            sequence=next_sequence,
            payload_json={"message": "Запуск ИИ отменен", "state": "cancelled"},
        )
    )
    db_session.commit()
    db_session.refresh(run)
    return run
