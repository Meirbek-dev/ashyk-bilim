"""Redis client lifecycle.

configure() is called exactly once from lifespan startup.
close()     is called during lifespan shutdown.

Both the sync and async clients start as None (no pool created at import
time).  get_sync() / get_async() return None when Redis is not configured,
so every caller must handle the None case gracefully.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import redis
    import redis.asyncio

_logger = logging.getLogger(__name__)

try:
    import redis as _redis
    import redis.asyncio as _aioredis
except Exception:  # pragma: no cover
    _redis = None  # type: ignore[assignment]
    _aioredis = None  # type: ignore[assignment]

_redis_available = _redis is not None and _aioredis is not None  # type: ignore[redundant-expr]
_sync_client: redis.Redis | None = None
_async_client: redis.asyncio.Redis | None = None


def configure(url: str) -> None:
    """Create sync and async Redis clients from *url*.

    Called once from lifespan startup.  No-ops if the redis package is not
    installed so the app degrades gracefully in minimal environments.
    """
    global _sync_client, _async_client
    if not _redis_available:
        _logger.warning("redis package not installed — Redis features disabled")
        return

    from typing import Any, cast
    redis_mod = cast(Any, _redis)
    aioredis_mod = cast(Any, _aioredis)

    _sync_client = redis_mod.Redis.from_url(
        url,
        decode_responses=False,
        socket_connect_timeout=2,
        socket_timeout=2,
        socket_keepalive=True,
        health_check_interval=10,
    )
    _async_client = aioredis_mod.Redis.from_url(
        url,
        decode_responses=False,
        socket_connect_timeout=2,
        socket_timeout=2,
        socket_keepalive=True,
        health_check_interval=10,
    )
    _logger.debug("Redis clients configured")


def get_sync() -> redis.Redis | None:
    """Return the synchronous Redis client, or None if not configured."""
    return _sync_client


def get_async() -> redis.asyncio.Redis | None:
    """Return the asynchronous Redis client, or None if not configured."""
    return _async_client


async def close() -> None:
    """Close both clients.  Called during lifespan shutdown."""
    global _sync_client, _async_client
    if _async_client is not None:
        try:
            await _async_client.aclose()
        except Exception:
            _logger.warning("Redis async close failed", exc_info=True)
    if _sync_client is not None:
        try:
            _sync_client.close()
        except Exception:
            _logger.warning("Redis sync close failed", exc_info=True)
    _sync_client = None
    _async_client = None
