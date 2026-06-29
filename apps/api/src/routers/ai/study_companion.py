from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from sqlmodel import Session

from src.auth.users import get_public_user
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.ai.operations import run_study_companion
from src.types import JsonObject

router = APIRouter(prefix="/study")


class StudyCompanionRequest(PydanticStrictBaseModel):
    question: str
    mode: Literal["explain", "practice", "flashcards", "summarize", "deepen"] = "explain"
    language: str = "auto"


@router.post("/{course_uuid}/ask", response_model=JsonObject)
async def api_study_companion(
    course_uuid: str,
    payload: StudyCompanionRequest,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> JsonObject:
    result = await run_study_companion(
        db_session,
        course_uuid,
        current_user,
        question=payload.question,
        mode=payload.mode,
        language=payload.language,
    )
    return result if isinstance(result, dict) else result.model_dump(mode="json")
