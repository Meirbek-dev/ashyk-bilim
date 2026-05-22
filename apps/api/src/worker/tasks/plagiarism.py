"""Durable plagiarism-detection tasks."""

from __future__ import annotations

import logging

from src.worker.broker import broker

logger = logging.getLogger(__name__)


@broker.task(task_name="plagiarism:batch_tick", retry_on_error=True, max_retries=3)
async def run_plagiarism_batch_tick() -> int:
    """Run one plagiarism-check tick across all unchecked text submissions."""
    import asyncio

    from src.tasks.plagiarism_checker import _run_check_tick

    try:
        flagged: int = await asyncio.to_thread(_run_check_tick)
        if flagged:
            logger.info("plagiarism_batch_tick flagged=%d pairs", flagged)
        return flagged
    except Exception:
        logger.exception("plagiarism_batch_tick failed")
        raise


@broker.task(
    task_name="plagiarism:check_file_submission",
    retry_on_error=True,
    max_retries=5,
)
async def check_file_submission_plagiarism(
    submission_uuid: str,
    file_keys: list[str],
) -> None:
    """Run the configured plagiarism provider against one file submission."""
    if not file_keys:
        return

    from src.services.events.subscribers.plagiarism import get_plagiarism_provider

    provider = get_plagiarism_provider()
    try:
        result = await provider.check(submission_uuid, file_keys)
        logger.info(
            "plagiarism_check submission=%s score=%s flagged=%s",
            submission_uuid,
            result.get("score", 0),
            result.get("flagged", False),
        )
    except Exception:
        logger.exception("plagiarism_check_failed submission=%s", submission_uuid)
        raise
