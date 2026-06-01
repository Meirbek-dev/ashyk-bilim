"""Rate limiting middleware for assessment endpoints.

Delegates to the Redis-backed sliding-window implementation in
``src.services.rate_limit``, which falls back to an in-process
TTLCache when Redis is unavailable.

This module exists as a thin shim so routers can import from a single,
stable location (``src.infra.rate_limit``) without knowing about the
service layer.

Usage in routers::

    from src.infra.rate_limit import rate_limit

    @router.post("/submit")
    @rate_limit(max_requests=1, window_seconds=5, key_func=lambda r: f"{r.state.user.id}:{r.path_params['assessment_uuid']}")
    async def submit(...): ...
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from functools import wraps
from typing import ParamSpec, TypeVar, cast

from fastapi import Request

from src.services.rate_limit import RateLimitRule, check_rate_limit

logger = logging.getLogger(__name__)

P = ParamSpec("P")
R = TypeVar("R")


def rate_limit(
    max_requests: int,
    window_seconds: int,
    key_func: Callable[[Request], str],
    *,
    namespace: str = "default",
) -> Callable[[Callable[P, Awaitable[R]]], Callable[P, Awaitable[R]]]:
    """Decorator that applies rate limiting to a FastAPI endpoint.

    Delegates to the Redis-backed ``check_rate_limit`` function, which
    automatically falls back to an in-process TTLCache when Redis is
    unavailable.  Works correctly across multiple pods / Gunicorn workers
    when Redis is reachable.

    Args:
        max_requests: Maximum number of requests allowed in the window.
        window_seconds: Duration of the sliding window in seconds.
        key_func: Function that extracts the rate-limit key from the request.
        namespace: Logical namespace prefix stored in Redis to prevent
            key collisions between different limiters.
    """
    rule = RateLimitRule(
        namespace=namespace,
        max_requests=max_requests,
        window_seconds=window_seconds,
    )

    def decorator(func: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            # Locate the Request object in args/kwargs
            request = cast(Request | None, kwargs.get("request"))
            if request is None:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request is not None:
                key = key_func(request)
                await check_rate_limit(key, rule)

            return await func(*args, **kwargs)

        return wrapper

    return decorator
