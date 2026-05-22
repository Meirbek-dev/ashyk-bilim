"""Durable plagiarism-detection tasks.

Two tasks are registered here:

``run_plagiarism_batch_tick``
    Periodic sweep of all unchecked text-based submissions. Previously this
    lived inside an ``asyncio.create_task()`` loop in ``lifespan.py``.
    Now it fires on a cron schedule from the taskiq scheduler, so even a
    process restart cannot cause a tick to be silently skipped.

``check_file_submission_plagiarism``
    Per-submission task triggered immediately after a student submits a file
    upload.  Replaces the in-process ``PlagiarismSubscriber.handle()`` which
    was fire-and-forget inside the EventBus.

Both tasks are idempotent:
- The batch tick writes ``metadata_json["plagiarism"]`` only for submissions
  where it is absent.
- The file task delegates to the pluggable ``PlagiarismProvider`` which is
  expected to be idempotent (e.g., deduplicates on ``submission_uuid``).
"""

from __future__ import annotations

import logging

from src.worker.broker import broker
from taskiq import TaskiqRetryMiddleware

logger = logging.getLogger(__name__)

# Attach retry middleware only once when this module is first imported.
# TaskiqRetryMiddleware reads the ``max_retries`` label set per-task.
if not any(isinstance(m, TaskiqRetryMiddleware) for m in broker.middlewares):
    broker.add_middlewares(TaskiqRetryMiddleware(default_retry_count=3))


# ── Batch tick (replaces plagiarism_checker_loop) ────────────────────────────


@broker.task(task_name="plagiarism:batch_tick", max_retries=3)
async def run_plagiarism_batch_tick() -> int:
    """Run one plagiarism-check tick across all unchecked text submissions.

    Returns the number of (submission, peer) pairs flagged in this tick.
    Safe to call multiple times — submissions already checked are skipped.
    """
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


# ── Per-submission file task (replaces PlagiarismSubscriber) ─────────────────


@broker.task(task_name="plagiarism:check_file_submission", max_retries=5)
async def check_file_submission_plagiarism(
    submission_uuid: str,
    file_keys: list[str],
) -> None:
    """Run the configured plagiarism provider against a single file submission.

    Idempotent — the provider is expected to handle repeated calls for the
    same ``submission_uuid`` gracefully (e.g., via its own deduplication).

    Args:
        submission_uuid: UUID of the ``Submission`` or ``FileSubmissionAttempt``.
        file_keys: Storage keys of the uploaded files to inspect.
    """
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
        raise  # Let taskiq retry
