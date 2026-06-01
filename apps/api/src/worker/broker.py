"""Taskiq broker singleton."""

from __future__ import annotations

import os
import sys
from typing import Any

from taskiq import InMemoryBroker, SimpleRetryMiddleware

_ENV = os.getenv("ENVIRONMENT", "production")
_IS_TEST = _ENV == "pytest" or "PYTEST_CURRENT_TEST" in os.environ or "pytest" in sys.modules


def _with_common_middlewares(broker: Any) -> Any:
    return broker.with_middlewares(
        SimpleRetryMiddleware(
            default_retry_count=3,
            default_retry_label=False,
        ),
    )


def _build_broker() -> Any:
    if _IS_TEST:
        return _with_common_middlewares(InMemoryBroker(await_inplace=True))

    try:
        from taskiq_redis import ListQueueBroker, RedisAsyncResultBackend
    except ImportError as exc:
        raise RuntimeError("taskiq-redis is not installed. Run `uv add taskiq-redis` to install it.") from exc

    from src.infra.settings import get_settings

    broker_url = get_settings().redis_config.taskiq_broker_url
    result_backend: Any = RedisAsyncResultBackend(broker_url)

    return _with_common_middlewares(
        ListQueueBroker(broker_url).with_result_backend(result_backend),
    )


broker = _build_broker()
