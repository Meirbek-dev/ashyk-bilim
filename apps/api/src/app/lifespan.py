import contextlib
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from sqlmodel import Session

from src.app.observability import configure_observability
from src.infra import redis as redis_infra
from src.infra.db.engine import (
    build_engine,
    build_session_factory,
    register_engine,
    unregister_engine,
)
from src.infra.logging import configure_logging
from src.infra.settings import AppSettings

logger = logging.getLogger(__name__)


def ensure_runtime_directories() -> None:
    Path("content").mkdir(parents=True, exist_ok=True)
    Path("logs").mkdir(parents=True, exist_ok=True)


def create_lifespan(settings: AppSettings) -> Callable[[FastAPI], AsyncIterator[None]]:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        configure_logging(settings)
        ensure_runtime_directories()

        engine = build_engine(settings)
        session_factory = build_session_factory(engine)
        register_engine(engine)

        redis_url = settings.redis_config.redis_connection_string
        if redis_url:
            redis_infra.configure(redis_url)

        app.state.settings = settings
        app.state.engine = engine
        app.state.session_factory = session_factory

        # Patch Judge0 compiler command flags dynamically on startup.
        from src.app.judge0_patch import start_judge0_patcher

        start_judge0_patcher(session_factory)

        configure_observability(app, settings, engine)

        # Register in-process event bus subscribers (analytics only).
        # Durable subscribers (XP award, plagiarism) are now taskiq tasks.
        from src.services.events.startup import register_all_subscribers

        register_all_subscribers()

        # ── Taskiq broker startup (client side — sends tasks, does not run them) ──
        # The worker process (``taskiq worker worker:broker``) executes the tasks.
        # In test mode (InMemoryBroker) tasks run inline; no worker needed.
        from src.worker.broker import broker

        if not broker.is_worker_process:
            await broker.startup()

        try:
            yield
        finally:
            # ── Taskiq broker shutdown ────────────────────────────────────────
            if not broker.is_worker_process:
                with contextlib.suppress(Exception):
                    await broker.shutdown()

            with contextlib.suppress(Exception):
                from src.services.utils.link_preview import close_link_preview_client

                await close_link_preview_client()
            with contextlib.suppress(Exception):
                from src.services.code_execution.service import (
                    close_code_execution_client,
                )

                close_code_execution_client()
            await redis_infra.close()
            unregister_engine()
            engine.dispose()

    return lifespan
