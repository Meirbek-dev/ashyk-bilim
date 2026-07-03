from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlmodel import Session, col, select

from config.config import get_settings
from src.auth.users import get_public_user
from src.db.ai_runtime import AIEvalResult, AIRun
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.ai.policy import require_ai_admin
from src.types import JsonObject

router = APIRouter(prefix="/admin")


class AIFeatureSetting(PydanticStrictBaseModel):
    key: str
    enabled: bool
    editable: bool = False
    source: str = "environment"


class AIAdminSettingsRead(PydanticStrictBaseModel):
    ai_enabled: bool
    provider_ready: bool
    model: str
    monthly_token_budget: int
    max_tokens_per_request: int
    max_output_tokens: int
    draft_mode_enabled: bool
    features: list[AIFeatureSetting]


class AIRunAggregate(PydanticStrictBaseModel):
    total: int
    queued: int
    running: int
    finished: int
    error: int
    aborted: int


class AIEvalSummary(PydanticStrictBaseModel):
    total: int
    passed: int
    failed: int
    average_score: float | None = None


class AIEvalResultRead(PydanticStrictBaseModel):
    eval_uuid: str
    run_id: int | None = None
    dataset: str
    evaluator: str
    score: float | None = None
    passed: bool | None = None
    details_json: JsonObject


class AIEvalDashboardRead(PydanticStrictBaseModel):
    runs: AIRunAggregate
    evals: AIEvalSummary
    recent_evals: list[AIEvalResultRead]


def _feature_settings() -> list[AIFeatureSetting]:
    config = get_settings().integrations.ai
    keys = [
        "course_analysis_enabled",
        "submission_analysis_enabled",
        "remediation_enabled",
        "course_qa_enabled",
        "study_companion_enabled",
        "lecture_authoring_enabled",
        "semantic_memory_enabled",
    ]
    return [AIFeatureSetting(key=key, enabled=bool(getattr(config, key))) for key in keys]


@router.get("/settings", response_model=AIAdminSettingsRead)
async def api_ai_admin_settings(
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AIAdminSettingsRead:
    require_ai_admin(current_user, db_session)
    config = get_settings().integrations.ai
    provider_ready = bool(config.openai_api_key or config.openrouter_api_key)
    model = config.openai_model if config.openai_api_key else config.openrouter_model
    return AIAdminSettingsRead(
        ai_enabled=config.ai_enabled,
        provider_ready=provider_ready,
        model=model,
        monthly_token_budget=config.monthly_token_budget,
        max_tokens_per_request=config.max_tokens_per_request,
        max_output_tokens=config.max_output_tokens,
        draft_mode_enabled=config.ai_draft_mode_enabled,
        features=_feature_settings(),
    )


@router.get("/evals", response_model=AIEvalDashboardRead)
async def api_ai_eval_dashboard(
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AIEvalDashboardRead:
    require_ai_admin(current_user, db_session)
    run_row = db_session.exec(
        select(
            func.count(AIRun.id),
            func.coalesce(func.sum(case((AIRun.status == "queued", 1), else_=0)), 0),
            func.coalesce(func.sum(case((AIRun.status == "running", 1), else_=0)), 0),
            func.coalesce(func.sum(case((AIRun.status == "finished", 1), else_=0)), 0),
            func.coalesce(func.sum(case((AIRun.status == "error", 1), else_=0)), 0),
            func.coalesce(func.sum(case((AIRun.status == "aborted", 1), else_=0)), 0),
        )
    ).one()
    eval_row = db_session.exec(
        select(
            func.count(AIEvalResult.id),
            func.coalesce(func.sum(case((AIEvalResult.passed == True, 1), else_=0)), 0),  # noqa: E712
            func.coalesce(func.sum(case((AIEvalResult.passed == False, 1), else_=0)), 0),  # noqa: E712
            func.avg(AIEvalResult.score),
        )
    ).one()
    recent = db_session.exec(select(AIEvalResult).order_by(col(AIEvalResult.created_at).desc()).limit(20)).all()
    return AIEvalDashboardRead(
        runs=AIRunAggregate(
            total=int(run_row[0] or 0),
            queued=int(run_row[1] or 0),
            running=int(run_row[2] or 0),
            finished=int(run_row[3] or 0),
            error=int(run_row[4] or 0),
            aborted=int(run_row[5] or 0),
        ),
        evals=AIEvalSummary(
            total=int(eval_row[0] or 0),
            passed=int(eval_row[1] or 0),
            failed=int(eval_row[2] or 0),
            average_score=float(eval_row[3]) if eval_row[3] is not None else None,
        ),
        recent_evals=[AIEvalResultRead.model_validate(item) for item in recent],
    )
