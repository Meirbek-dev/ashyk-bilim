from sqlalchemy import text
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session

from src.infra.db.session import session_scope


def get_liveness_status() -> dict[str, object]:
    return {
        "status": "alive",
        "checks": {"app": {"status": "ok"}},
    }


def get_readiness_status(session_factory: sessionmaker[Session]) -> dict[str, object]:
    checks: dict[str, dict[str, object]] = {}
    overall_status = "ready"

    try:
        with session_scope(session_factory) as session:
            session.exec(text("SELECT 1"))
        checks["database"] = {"status": "ok"}
    except Exception as exc:
        overall_status = "degraded"
        checks["database"] = {"status": "error", "detail": str(exc)}

    return {
        "status": overall_status,
        "checks": checks,
    }
