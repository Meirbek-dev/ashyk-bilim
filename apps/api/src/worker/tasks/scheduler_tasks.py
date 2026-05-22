"""Periodic cron tasks — replace the five asyncio.create_task() polling loops.

Previously each loop ran inside the FastAPI lifespan as an ``asyncio.Task``.
This had two problems:
1. Work was silently dropped on process restart (no durability).
2. Multiple API workers (e.g., Granian with ``GRANIAN_WORKERS > 1``) each
   ran their own loop, causing N duplicate ticks per interval.

With taskiq's ``TaskiqScheduler`` + ``RedisScheduleSource`` only ONE tick
fires per interval across all workers — Redis acts as the distributed lock.

Cron schedule (all times UTC):
    assessment_scheduler:  every 1 minute
    plagiarism_checker:    every 2 minutes
    upload_reaper:         every 6 hours
    vector_ttl_sweep:      every 1 hour

These tasks are registered on the broker at import time.  The scheduler
process (``taskiq scheduler worker:scheduler``) reads the cron definitions
and enqueues them automatically.
"""

from __future__ import annotations

import asyncio
import logging

from src.worker.broker import broker

logger = logging.getLogger(__name__)


# ── Assessment scheduler ──────────────────────────────────────────────────────


@broker.task(task_name="scheduler:assessment_publish", max_retries=1)
async def assessment_scheduler_tick() -> int:
    """Auto-publish SCHEDULED assessments whose ``scheduled_at`` is past.

    Returns the number of assessments published in this tick.
    Idempotent — assessments already PUBLISHED are filtered out by the query.
    """
    from src.tasks.assessment_scheduler import _publish_due_assessments

    try:
        published: int = await asyncio.to_thread(_publish_due_assessments)
        if published:
            logger.info("assessment_scheduler_tick published=%d", published)
        return published
    except Exception:
        logger.exception("assessment_scheduler_tick failed")
        raise


# ── Plagiarism batch sweep ────────────────────────────────────────────────────


@broker.task(task_name="scheduler:plagiarism_sweep", max_retries=1)
async def plagiarism_checker_tick() -> int:
    """Run one plagiarism sweep tick across all unchecked text submissions.

    Delegates to ``src.worker.tasks.plagiarism.run_plagiarism_batch_tick``
    logic directly (without re-enqueuing) so the cron tick IS the work unit.

    Returns the number of flagged pairs.
    """
    from src.tasks.plagiarism_checker import _run_check_tick

    try:
        flagged: int = await asyncio.to_thread(_run_check_tick)
        if flagged:
            logger.info("plagiarism_checker_tick flagged=%d pairs", flagged)
        return flagged
    except Exception:
        logger.exception("plagiarism_checker_tick failed")
        raise


# ── Upload reaper ─────────────────────────────────────────────────────────────


@broker.task(task_name="scheduler:upload_reaper", max_retries=1)
async def upload_reaper_tick() -> dict:
    """Delete orphan upload records that were never finalised.

    Returns the result dict from ``reap_orphan_uploads``.
    """
    from sqlmodel import Session

    from src.infra.db.engine import get_bg_engine
    from src.tasks.upload_reaper import reap_orphan_uploads

    try:
        engine = get_bg_engine()
        result: dict = await asyncio.to_thread(
            lambda: reap_orphan_uploads(Session(engine).__enter__())
        )
        logger.info("upload_reaper_tick result=%s", result)
        return result
    except Exception:
        logger.exception("upload_reaper_tick failed")
        raise


# ── Vector TTL sweep ──────────────────────────────────────────────────────────


@broker.task(task_name="scheduler:vector_ttl_sweep", max_retries=1)
async def vector_ttl_sweep_tick() -> int:
    """Remove expired AI document chunks past their retention window.

    Returns the number of chunks deleted (-1 if the table does not exist yet).
    """
    from src.infra.settings import get_settings

    settings = get_settings()
    retention = settings.ai_config.collection_retention

    try:
        from src.services.ai.retrieval import delete_expired_chunks

        removed: int = await asyncio.to_thread(delete_expired_chunks, retention)
        if removed == -1:
            logger.warning("vector_ttl_sweep skipped: table not found")
        elif removed:
            logger.info("vector_ttl_sweep removed=%d chunks", removed)
        return removed
    except Exception:
        logger.exception("vector_ttl_sweep_tick failed")
        raise
