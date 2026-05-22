"""Taskiq broker singleton.

Rules
-----
- In production (Redis available): ``ListQueueBroker`` backed by the app's
  Redis instance on DB 1, with ``RedisAsyncResultBackend`` for observability.
- In development (``PLATFORM_DEVELOPMENT_MODE=true``): ``ListQueueBroker`` is
  still used so the full async path is exercised, but callers can also run
  a local worker easily.
- In tests (``ENVIRONMENT=pytest``): ``InMemoryBroker(await_inplace=True)``
  so tasks execute synchronously inside the test loop — no worker process
  needed, no network required.

Usage
-----
Import ``broker`` wherever you need to enqueue a task::

    from src.worker.broker import broker

    @broker.task
    async def my_task(x: int) -> int:
        return x + 1

    # Enqueue (fire-and-forget):
    await my_task.kiq(42)

Lifespan integration (API process — client side only)::

    if not broker.is_worker_process:
        await broker.startup()
    ...
    if not broker.is_worker_process:
        await broker.shutdown()

Worker process: run ``taskiq worker worker:broker`` from the ``apps/api``
directory.
"""

from __future__ import annotations

import os

from taskiq import InMemoryBroker

_ENV = os.getenv("ENVIRONMENT", "production")
_IS_TEST = _ENV == "pytest"


def _build_broker():  # type: ignore[return]
    """Build the appropriate broker for the current environment."""
    if _IS_TEST:
        return InMemoryBroker(await_inplace=True)

    # Production / development: use Redis-backed broker.
    # Import lazily so missing taskiq-redis at import-time only surfaces
    # when actually needed (e.g., not in pure-unit-test environments that
    # install only the base package).
    try:
        from taskiq_redis import ListQueueBroker, RedisAsyncResultBackend
    except ImportError as exc:
        raise RuntimeError(
            "taskiq-redis is not installed. Run `uv add taskiq-redis` to install it."
        ) from exc

    # Read config at broker-build time (called once at module import).
    # We import settings lazily to avoid circular imports during test
    # collection (settings may not be fully initialised yet).
    from src.infra.settings import get_settings

    settings = get_settings()
    broker_url = settings.redis_config.taskiq_broker_url

    result_backend = RedisAsyncResultBackend(broker_url)

    return ListQueueBroker(broker_url).with_result_backend(result_backend)


broker = _build_broker()
