"""Durable bulk-grading task.

Replaces ``BackgroundTasks.add_task(run_deadline_extension_action, ...)``
in ``routers/grading/teacher.py``.

FastAPI ``BackgroundTasks`` run inside the same process after the response is
sent.  If the process restarts before the task finishes, the work is silently
dropped and the ``BulkAction`` row stays in ``PENDING`` status forever.

This taskiq task persists the job to Redis before the HTTP response is
returned, so the worker process picks it up regardless of what happens to
the API process.

Idempotency: ``execute_deadline_extension`` transitions the ``BulkAction``
row from ``PENDING → RUNNING → COMPLETED/FAILED``. Replaying a task for an
already-``COMPLETED`` action is a no-op because the overrides already exist.
"""

from __future__ import annotations

import logging

from src.worker.broker import broker

logger = logging.getLogger(__name__)


@broker.task(
    task_name="grading:deadline_extension",
    retry_on_error=True,
    max_retries=2,
)
async def execute_deadline_extension_task(action_uuid: str) -> None:
    """Execute a deadline-extension bulk action identified by *action_uuid*.

    The action row must already exist in the DB (created synchronously in the
    request handler before this task is enqueued).

    Retry policy: 2 retries.  The action status transitions handle the
    idempotency — if the action is already COMPLETED the task exits early.

    Args:
        action_uuid: ``BulkAction.action_uuid`` to execute.

    """
    from src.services.grading.bulk import run_deadline_extension_action

    try:
        await run_deadline_extension_action(action_uuid)
        logger.info("deadline_extension_task completed action=%s", action_uuid)
    except Exception:
        logger.exception("deadline_extension_task failed action=%s", action_uuid)
        raise  # taskiq will retry
