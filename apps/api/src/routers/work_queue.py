from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from src.auth.users import get_public_user
from src.db.users import PublicUser
from src.db.work_queue import WorkQueueResponse, WorkRole
from src.infra.db.session import get_db_session
from src.services.work_queue import get_work_queue

router = APIRouter()


@router.get("/work", response_model=WorkQueueResponse)
async def api_get_work_queue(
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    role: Annotated[WorkRole, Query()] = "learner",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[str | None, Query()] = None,
) -> WorkQueueResponse:
    try:
        return get_work_queue(current_user, db_session, role=role, limit=limit, cursor=cursor)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "INVALID_WORK_CURSOR", "message": str(exc)},
        ) from exc
