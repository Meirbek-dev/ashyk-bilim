from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func
from sqlmodel import Session, col, select

from config.config import get_settings
from src.auth.users import get_public_user
from src.db.ai_runtime import AIArtifactRecord, AIEvalResult, AIEvent, AIRun
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.ai.policy import require_ai_admin
from src.types import JsonObject, as_int

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


class AIOperationRunRead(PydanticStrictBaseModel):
    run_uuid: str
    status: str
    feature: str
    model_name: str | None = None
    error_code: str | None = None
    duration_ms: int | None = None
    time_to_first_text_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_estimate: float | None = None
    retry_count: int = 0
    started_at: datetime
    completed_at: datetime | None = None
    stuck: bool = False
    context: JsonObject


class AIOperationEventRead(PydanticStrictBaseModel):
    event_id: str
    sequence: int
    event_type: str
    created_at: datetime
    payload: JsonObject


class AIOperationRunDetailRead(PydanticStrictBaseModel):
    run: AIOperationRunRead
    events: list[AIOperationEventRead]
    artifact_uuids: list[str]


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


def _safe_run_context(metadata: JsonObject) -> JsonObject:
    allowed = {
        "activity_uuid",
        "citation_validation",
        "context_source_count",
        "course_uuid",
        "kind",
        "submission_uuid",
        "thread_uuid",
        "time_to_first_text_ms",
        "retry_count",
    }
    return {key: value for key, value in metadata.items() if key in allowed}


def _operation_run(run: AIRun, *, now: datetime) -> AIOperationRunRead:
    metadata = dict(run.run_metadata or {})
    time_to_first_text_ms = metadata.get("time_to_first_text_ms")
    started_at = run.started_at if run.started_at.tzinfo else run.started_at.replace(tzinfo=UTC)
    age = now - started_at
    return AIOperationRunRead(
        run_uuid=run.run_uuid,
        status=run.status,
        feature=str(metadata.get("kind") or "unknown"),
        model_name=run.model_name,
        error_code=run.error_code,
        duration_ms=run.duration_ms,
        time_to_first_text_ms=(
            int(time_to_first_text_ms) if isinstance(time_to_first_text_ms, int | float) else None
        ),
        input_tokens=run.input_tokens,
        output_tokens=run.output_tokens,
        cost_estimate=float(run.cost_estimate) if run.cost_estimate is not None else None,
        retry_count=as_int(metadata.get("retry_count") or 0, field="retry_count"),
        started_at=run.started_at,
        completed_at=run.completed_at,
        stuck=run.status in {"queued", "running"} and age > timedelta(minutes=10),
        context=_safe_run_context(metadata),
    )


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
        select(  # type: ignore[call-overload]
            func.count(col(AIRun.id)),
            func.coalesce(func.sum(case((col(AIRun.status) == "queued", 1), else_=0)), 0),
            func.coalesce(func.sum(case((col(AIRun.status) == "running", 1), else_=0)), 0),
            func.coalesce(func.sum(case((col(AIRun.status) == "finished", 1), else_=0)), 0),
            func.coalesce(func.sum(case((col(AIRun.status) == "error", 1), else_=0)), 0),
            func.coalesce(func.sum(case((col(AIRun.status) == "aborted", 1), else_=0)), 0),
        )
    ).one()
    eval_row = db_session.exec(
        select(
            func.count(col(AIEvalResult.id)),
            func.coalesce(func.sum(case((col(AIEvalResult.passed) == True, 1), else_=0)), 0),  # ruff: ignore[true-false-comparison]
            func.coalesce(func.sum(case((col(AIEvalResult.passed) == False, 1), else_=0)), 0),  # ruff: ignore[true-false-comparison]
            func.avg(col(AIEvalResult.score)),
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


@router.get("/runs", response_model=list[AIOperationRunRead])
async def api_ai_operation_runs(
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
    days: Annotated[int, Query(ge=1, le=90)] = 7,
    run_status: Annotated[str | None, Query(alias="status")] = None,
    feature: Annotated[str | None, Query()] = None,
    provider: Annotated[str | None, Query()] = None,
    course_uuid: Annotated[str | None, Query()] = None,
) -> list[AIOperationRunRead]:
    require_ai_admin(current_user, db_session)
    now = datetime.now(UTC)
    statement = select(AIRun).where(AIRun.started_at >= now - timedelta(days=days))
    if run_status:
        statement = statement.where(AIRun.status == run_status)
    runs = db_session.exec(statement.order_by(col(AIRun.started_at).desc()).limit(200)).all()
    result = [_operation_run(run, now=now) for run in runs]
    if feature:
        result = [run for run in result if run.feature == feature]
    if provider:
        result = [run for run in result if provider.casefold() in (run.model_name or "").casefold()]
    if course_uuid:
        result = [run for run in result if run.context.get("course_uuid") == course_uuid]
    return result


@router.get("/runs/{run_uuid}", response_model=AIOperationRunDetailRead)
async def api_ai_operation_run_detail(
    run_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AIOperationRunDetailRead:
    require_ai_admin(current_user, db_session)
    run = db_session.exec(select(AIRun).where(AIRun.run_uuid == run_uuid)).first()
    if run is None or run.id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI_RUN_NOT_FOUND")
    events = db_session.exec(select(AIEvent).where(AIEvent.run_id == run.id).order_by(col(AIEvent.sequence))).all()
    artifacts = db_session.exec(
        select(AIArtifactRecord).where(AIArtifactRecord.run_id == run.id).order_by(col(AIArtifactRecord.created_at))
    ).all()
    return AIOperationRunDetailRead(
        run=_operation_run(run, now=datetime.now(UTC)),
        events=[
            AIOperationEventRead(
                event_id=event.event_id,
                sequence=event.sequence,
                event_type=event.event_type,
                created_at=event.created_at,
                payload=_safe_run_context(dict(event.payload_json or {})),
            )
            for event in events
        ],
        artifact_uuids=[artifact.artifact_uuid for artifact in artifacts],
    )
