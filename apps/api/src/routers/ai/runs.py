from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from src.db.ai_runtime import AIRun, AIRunStatus
from src.db.strict_base_model import PydanticStrictBaseModel
from src.infra.db.session import get_db_session

router = APIRouter(prefix="/runs")


class AIRunStatusRead(PydanticStrictBaseModel):
    run_uuid: str
    status: str
    model_name: str | None = None
    error_code: str | None = None


@router.get("/{run_uuid}", response_model=AIRunStatusRead)
async def api_get_ai_run(
    run_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AIRun:
    run = db_session.exec(select(AIRun).where(AIRun.run_uuid == run_uuid)).first()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI run not found")
    return run


@router.post("/{run_uuid}/cancel", response_model=AIRunStatusRead)
async def api_cancel_ai_run(
    run_uuid: str,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AIRun:
    run = db_session.exec(select(AIRun).where(AIRun.run_uuid == run_uuid)).first()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI run not found")
    if run.status in {AIRunStatus.FINISHED.value, AIRunStatus.ERROR.value, AIRunStatus.ABORTED.value}:
        return run
    from src.db.ai_runtime import utc_now

    run.status = AIRunStatus.ABORTED.value
    run.completed_at = utc_now()
    db_session.add(run)
    db_session.commit()
    db_session.refresh(run)
    return run
