"""Taskiq worker + scheduler entrypoint.

Run the worker
--------------
From the ``apps/api/`` directory:

    taskiq worker worker:broker

Run the scheduler (in a separate terminal / container)
------------------------------------------------------
    taskiq scheduler worker:scheduler

How it works
------------
1. ``broker`` is the ``ListQueueBroker`` defined in ``src/worker/broker.py``.
2. All task modules are imported here so the ``@broker.task`` decorators
   register each task with the broker before the worker starts listening.
3. ``taskiq_fastapi.init(broker, "app:app")`` wires FastAPI's dependency
   injection into the worker process.  This means tasks can ``TaskiqDepends``
   on any FastAPI dependency (DB session, settings, etc.) just like routes do.
4. ``scheduler`` is a ``TaskiqScheduler`` backed by ``RedisScheduleSource``
   so cron jobs are distributed — only one tick fires per interval regardless
   of how many worker processes are running.

Environment variables
---------------------
``PLATFORM_TASKIQ_BROKER_URL``
    Redis URL for the task queue (default: same host as
    ``PLATFORM_REDIS_CONNECTION_STRING`` but on DB index 1).

``ENVIRONMENT``
    Set to ``pytest`` in CI/test runs to swap in the ``InMemoryBroker``
    automatically — no external Redis required.
"""

from __future__ import annotations

import taskiq_fastapi

# ── 2. Register all task modules ─────────────────────────────────────────────
# Importing each module causes its @broker.task decorators to fire, which
# registers the task with the broker.  The order does not matter.
import src.worker.tasks.audit
import src.worker.tasks.bulk_grading
import src.worker.tasks.plagiarism
import src.worker.tasks.scheduler_tasks
import src.worker.tasks.sse
import src.worker.tasks.xp_award

# ── 1. Import broker (must be first) ─────────────────────────────────────────
from src.worker.broker import broker

# ── 3. Wire FastAPI dependency injection into the worker ──────────────────────
# This must be called after the broker is constructed and before the worker
# starts.  It gives task functions access to FastAPI dependencies via
# TaskiqDepends() — including the DB session, settings, etc.
taskiq_fastapi.init(broker, "app:app")

# ── 4. Build the scheduler (only used by `taskiq scheduler worker:scheduler`) ─
try:
    from taskiq_redis import RedisScheduleSource

    from src.infra.settings import get_settings
    from taskiq import TaskiqScheduler

    _settings = get_settings()
    _broker_url = _settings.redis_config.taskiq_broker_url

    schedule_source = RedisScheduleSource(_broker_url)
    scheduler = TaskiqScheduler(broker=broker, sources=[schedule_source])

    # ── Cron schedule registration ────────────────────────────────────────────
    # Each cron entry is stored in Redis by the schedule source so the
    # scheduler process can read and enqueue them at the right time.
    # These match the former asyncio polling intervals in lifespan.py.
    from src.worker.tasks.scheduler_tasks import (
        assessment_scheduler_tick,
        plagiarism_checker_tick,
        upload_reaper_tick,
        vector_ttl_sweep_tick,
    )
    from taskiq import CronSchedule

    _CRON_TASKS = [
        (assessment_scheduler_tick, "*/1 * * * *", "Assessment auto-publish"),
        (plagiarism_checker_tick, "*/2 * * * *", "Plagiarism text sweep"),
        (upload_reaper_tick, "0 */6 * * *", "Orphan upload reaper"),
        (vector_ttl_sweep_tick, "0 * * * *", "Vector TTL sweep"),
    ]

    for _task_fn, _cron, _label in _CRON_TASKS:
        schedule_source.add_schedule(  # type: ignore[attr-defined]
            CronSchedule(
                cron=_cron,
                task_name=_task_fn.task_name,  # type: ignore[attr-defined]
                labels={"description": _label},
            )
        )

except ImportError:
    # taskiq-redis not installed (e.g., minimal test environment) or
    # running with InMemoryBroker — scheduler is not needed.
    scheduler = None  # type: ignore[assignment]
