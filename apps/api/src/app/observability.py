import logfire
from fastapi import FastAPI
from sqlalchemy.engine import Engine

from src.infra.settings import AppSettings

_logfire_configured = False


def configure_observability(
    app: FastAPI,
    settings: AppSettings,
    engine: Engine,
) -> None:
    global _logfire_configured

    if not settings.general_config.logfire_enabled:
        return

    if not _logfire_configured:
        logfire.configure(console=False, service_name="Ashyq Bilim")
        _logfire_configured = True

    logfire.instrument_fastapi(app)
    logfire.instrument_sqlalchemy(engine=engine)
