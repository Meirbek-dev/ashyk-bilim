import redis
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker
from sqlmodel import Session
from taskiq import InMemoryBroker

from src.infra import redis as redis_infra
from src.infra.db.execute import sa_execute
from src.infra.db.session import session_scope
from src.infra.settings import get_settings
from src.worker.broker import broker


def get_liveness_status() -> dict[str, object]:
    return {
        "status": "alive",
        "checks": {"app": {"status": "ok"}},
    }


def get_readiness_status(session_factory: sessionmaker[Session]) -> dict[str, object]:
    checks: dict[str, dict[str, object]] = {}
    overall_status = "ready"

    # 1. Database Check
    try:
        with session_scope(session_factory) as session:
            sa_execute(session, text("SELECT 1"))
        checks["database"] = {"status": "ok"}
    except Exception as exc:
        overall_status = "degraded"
        checks["database"] = {"status": "error", "detail": str(exc)}

    # 2. Redis Check
    try:
        redis_client = redis_infra.get_sync()
        if redis_client is not None:
            redis_client.ping()
            checks["redis"] = {"status": "ok"}
        else:
            settings = get_settings()
            if settings.redis_config.redis_connection_string:
                client = redis.Redis.from_url(settings.redis_config.redis_connection_string, socket_timeout=2)
                client.ping()
                checks["redis"] = {"status": "ok"}
            else:
                checks["redis"] = {"status": "disabled"}
    except Exception as exc:
        overall_status = "degraded"
        checks["redis"] = {"status": "error", "detail": str(exc)}

    # 3. Taskiq Check
    try:
        if isinstance(broker, InMemoryBroker):
            checks["taskiq"] = {"status": "ok", "type": "in_memory"}
        else:
            settings = get_settings()
            broker_url = settings.redis_config.taskiq_broker_url
            if broker_url:
                client = redis.Redis.from_url(broker_url, socket_timeout=2)
                client.ping()
                checks["taskiq"] = {"status": "ok"}
            else:
                checks["taskiq"] = {"status": "disabled"}
    except Exception as exc:
        overall_status = "degraded"
        checks["taskiq"] = {"status": "error", "detail": str(exc)}

    return {
        "status": overall_status,
        "checks": checks,
    }
