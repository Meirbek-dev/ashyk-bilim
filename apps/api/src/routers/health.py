from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from src.infra.health import get_liveness_status, get_readiness_status

router = APIRouter()


@router.get("")
def health(request: Request) -> JSONResponse:
    payload = get_readiness_status(request.app.state.session_factory)
    status_code = 200 if payload["status"] == "ready" else 503
    return JSONResponse(status_code=status_code, content=payload)


@router.get("/live")
def health_live() -> dict[str, object]:
    return get_liveness_status()


@router.get("/ready")
def health_ready(request: Request) -> JSONResponse:
    payload = get_readiness_status(request.app.state.session_factory)
    status_code = 200 if payload["status"] == "ready" else 503
    return JSONResponse(status_code=status_code, content=payload)
