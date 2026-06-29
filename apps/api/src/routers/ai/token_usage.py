from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, select

from config.config import get_settings
from src.db.ai_runtime import AIRun
from src.db.strict_base_model import PydanticStrictBaseModel
from src.infra.db.session import get_db_session

router = APIRouter(prefix="/usage")


class AIUsageSummary(PydanticStrictBaseModel):
    total_runs: int
    input_tokens: int
    output_tokens: int
    monthly_budget: int
    remaining_budget: int


@router.get("", response_model=AIUsageSummary)
async def api_ai_usage(db_session: Annotated[Session, Depends(get_db_session)]) -> AIUsageSummary:
    row = db_session.exec(
        select(
            func.count(AIRun.id),
            func.coalesce(func.sum(AIRun.input_tokens), 0),
            func.coalesce(func.sum(AIRun.output_tokens), 0),
        )
    ).one()
    total_runs = int(row[0] or 0)
    input_tokens = int(row[1] or 0)
    output_tokens = int(row[2] or 0)
    budget = get_settings().integrations.ai.monthly_token_budget
    used = input_tokens + output_tokens
    return AIUsageSummary(
        total_runs=total_runs,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        monthly_budget=budget,
        remaining_budget=max(0, budget - used),
    )


@router.get("/budget", response_model=AIUsageSummary)
async def api_ai_budget(db_session: Annotated[Session, Depends(get_db_session)]) -> AIUsageSummary:
    return await api_ai_usage(db_session)
