"""Periodic Taskiq scheduler tasks."""

from __future__ import annotations

import asyncio
import logging

from src.worker.broker import broker

logger = logging.getLogger(__name__)


@broker.task(
    task_name="scheduler:assessment_publish",
    retry_on_error=True,
    max_retries=1,
    schedule=[{"cron": "*/1 * * * *", "schedule_id": "assessment-auto-publish"}],
)
async def assessment_scheduler_tick() -> int:
    """Auto-publish scheduled assessments whose scheduled time has passed."""
    from src.tasks.assessment_scheduler import _publish_due_assessments

    try:
        published: int = await asyncio.to_thread(_publish_due_assessments)
        if published:
            logger.info("assessment_scheduler_tick published=%d", published)
        return published
    except Exception:
        logger.exception("assessment_scheduler_tick failed")
        raise


@broker.task(
    task_name="scheduler:assessment_timer",
    retry_on_error=True,
    max_retries=1,
    schedule=[{"interval": 30, "schedule_id": "assessment-timer"}],
)
async def assessment_timer_tick() -> int:
    """Auto-submit timed-out draft submissions."""
    from src.tasks.assessment_timer import _auto_submit_expired_drafts

    try:
        submitted: int = await _auto_submit_expired_drafts()
        if submitted:
            logger.info("assessment_timer_tick submitted=%d", submitted)
        return submitted
    except Exception:
        logger.exception("assessment_timer_tick failed")
        raise


@broker.task(
    task_name="scheduler:plagiarism_sweep",
    retry_on_error=True,
    max_retries=1,
    schedule=[{"cron": "*/2 * * * *", "schedule_id": "plagiarism-text-sweep"}],
)
async def plagiarism_checker_tick() -> int:
    """Run one plagiarism sweep tick across unchecked text submissions."""
    from src.tasks.plagiarism_checker import _run_check_tick

    try:
        flagged: int = await asyncio.to_thread(_run_check_tick)
        if flagged:
            logger.info("plagiarism_checker_tick flagged=%d pairs", flagged)
        return flagged
    except Exception:
        logger.exception("plagiarism_checker_tick failed")
        raise


@broker.task(
    task_name="scheduler:upload_reaper",
    retry_on_error=True,
    max_retries=1,
    schedule=[{"cron": "0 */6 * * *", "schedule_id": "orphan-upload-reaper"}],
)
async def upload_reaper_tick() -> dict[str, int]:
    """Delete orphan upload records that were never finalized."""
    from sqlmodel import Session

    from src.infra.db.engine import get_bg_engine
    from src.tasks.upload_reaper import reap_orphan_uploads

    try:
        engine = get_bg_engine()

        def _run() -> dict[str, int]:
            with Session(engine) as session:
                return reap_orphan_uploads(session)

        result = await asyncio.to_thread(_run)
        logger.info("upload_reaper_tick result=%s", result)
        return result
    except Exception:
        logger.exception("upload_reaper_tick failed")
        raise


@broker.task(
    task_name="scheduler:vector_ttl_sweep",
    retry_on_error=True,
    max_retries=1,
    schedule=[{"cron": "0 * * * *", "schedule_id": "vector-ttl-sweep"}],
)
async def vector_ttl_sweep_tick() -> int:
    """Remove expired AI document chunks past their retention window."""
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
