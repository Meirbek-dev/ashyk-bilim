"""Durable AI workflow execution tasks."""

from __future__ import annotations

import logging

from sqlmodel import Session

from src.infra.db.engine import build_session_factory, get_bg_engine
from src.services.ai.operations import execute_queued_ai_run
from src.worker.broker import broker

logger = logging.getLogger(__name__)


@broker.task(task_name="ai:execute_run", retry_on_error=True, max_retries=2)
async def execute_ai_run_task(run_uuid: str) -> None:
    """Execute a queued AI run using the same operation path as HTTP callers."""
    session_factory = build_session_factory(get_bg_engine())
    try:
        with session_factory() as db_session:
            assert isinstance(db_session, Session)
            await execute_queued_ai_run(db_session, run_uuid)
        logger.info("ai_run_task completed run=%s", run_uuid)
    except Exception:
        logger.exception("ai_run_task failed run=%s", run_uuid)
        raise
