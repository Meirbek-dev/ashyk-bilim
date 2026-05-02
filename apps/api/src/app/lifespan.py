import asyncio
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
from src.tasks.assignment_scheduler import assignment_scheduler_loop
from src.tasks.upload_reaper import reap_orphan_uploads

logger = logging.getLogger(__name__)


def ensure_runtime_directories() -> None:
    Path("content").mkdir(parents=True, exist_ok=True)
    Path("logs").mkdir(parents=True, exist_ok=True)


async def _ttl_sweep_loop(retention_seconds: int) -> None:
    while True:
        await asyncio.sleep(3600)
        try:
            from src.services.ai.retrieval import delete_expired_chunks

            removed = await asyncio.to_thread(delete_expired_chunks, retention_seconds)
            if removed == -1:
                logger.warning(
                    "Vector TTL sweep skipped: document_chunks table not found"
                )
            elif removed:
                logger.info("Vector TTL sweep removed %d expired chunk(s)", removed)
        except Exception:
            logger.exception("Vector TTL sweep failed")


async def _upload_reaper_loop(session_factory: Callable[[], Session]) -> None:
    while True:
        await asyncio.sleep(3600 * 6)  # run every 6 hours
        try:
            with session_factory() as db_session:
                result = await asyncio.to_thread(reap_orphan_uploads, db_session)
                logger.info("upload_reaper done: %s", result)
        except Exception:
            logger.exception("Upload reaper failed")


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

        configure_observability(app, settings, engine)

        ttl_sweep_task = asyncio.create_task(
            _ttl_sweep_loop(settings.ai_config.collection_retention),
            name="vector_ttl_sweep",
        )
        scheduler_task = asyncio.create_task(
            assignment_scheduler_loop(settings),
            name="assignment_scheduler",
        )
        upload_reaper_task = asyncio.create_task(
            _upload_reaper_loop(session_factory),
            name="upload_reaper",
        )

        try:
            yield
        finally:
            for bg_task in (ttl_sweep_task, scheduler_task, upload_reaper_task):
                if not bg_task.done():
                    bg_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await bg_task
            await redis_infra.close()
            unregister_engine()
            engine.dispose()

    return lifespan
