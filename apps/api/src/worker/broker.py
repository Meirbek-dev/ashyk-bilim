"""Taskiq broker singleton."""

from __future__ import annotations

import os
import sys

from taskiq import AsyncBroker, AsyncResultBackend, InMemoryBroker, SimpleRetryMiddleware

_ENV = os.getenv("ENVIRONMENT", "production")
_IS_TEST = _ENV == "pytest" or "PYTEST_CURRENT_TEST" in os.environ or "pytest" in sys.modules


def _with_common_middlewares(broker: AsyncBroker) -> AsyncBroker:
    return broker.with_middlewares(
        SimpleRetryMiddleware(
            default_retry_count=3,
            default_retry_label=False,
        ),
    )


def _build_broker() -> AsyncBroker:
    if _IS_TEST:
        return _with_common_middlewares(InMemoryBroker(await_inplace=True))

    try:
        from taskiq_redis import ListQueueBroker, RedisAsyncResultBackend, redis_broker as taskiq_redis_broker
    except ImportError as exc:
        msg = "taskiq-redis is not installed. Run `uv add taskiq-redis` to install it."
        raise RuntimeError(msg) from exc

    # taskiq-redis 1.2.3 resolves this name to the built-in exception, so Redis
    # disconnects escape its retry loop and kill the worker process.
    from redis.exceptions import ConnectionError as RedisConnectionError

    taskiq_redis_broker.__dict__["ConnectionError"] = RedisConnectionError

    from src.infra.settings import get_settings

    broker_url = get_settings().redis_config.taskiq_broker_url
    redis_kwargs = {
        "socket_keepalive": True,
        "health_check_interval": 30,
        "socket_timeout": None,
    }
    result_backend: AsyncResultBackend[object] = RedisAsyncResultBackend(broker_url, **redis_kwargs)  # type: ignore[arg-type]

    return _with_common_middlewares(
        ListQueueBroker(broker_url, **redis_kwargs).with_result_backend(result_backend),  # type: ignore[arg-type]
    )


broker = _build_broker()
