from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.db.strict_base_model import PydanticStrictBaseModel
from src.infra.health import get_liveness_status, get_readiness_status
from src.types import JsonObject

router = APIRouter()


class HealthStatusResponse(PydanticStrictBaseModel):
    status: str
    checks: dict[str, JsonObject]


@router.get("", response_model=HealthStatusResponse)
def health(request: Request) -> JSONResponse:
    payload = get_readiness_status(request.app.state.session_factory)
    status_code = 200 if payload["status"] == "ready" else 503
    return JSONResponse(status_code=status_code, content=payload)


@router.get("/live", response_model=HealthStatusResponse)
def health_live() -> dict[str, object]:
    return get_liveness_status()


@router.get("/ready", response_model=HealthStatusResponse)
def health_ready(request: Request) -> JSONResponse:
    payload = get_readiness_status(request.app.state.session_factory)
    status_code = 200 if payload["status"] == "ready" else 503
    return JSONResponse(status_code=status_code, content=payload)
