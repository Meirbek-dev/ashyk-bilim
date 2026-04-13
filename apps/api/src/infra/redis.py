"""Redis client lifecycle.

configure() is called exactly once from lifespan startup.
close()     is called during lifespan shutdown.

Both the sync and async clients start as None (no pool created at import
time).  get_sync() / get_async() return None when Redis is not configured,
so every caller must handle the None case gracefully.
"""

from __future__ import annotations

import logging

_logger = logging.getLogger(__name__)

try:
    import redis as _redis
    import redis.asyncio as _aioredis

    _REDIS_AVAILABLE = True
except Exception:  # pragma: no cover
    _redis = None  # type: ignore[assignment]
    _aioredis = None  # type: ignore[assignment]
    _REDIS_AVAILABLE = False

_sync_client = None
_async_client = None


def configure(url: str) -> None:
    """Create sync and async Redis clients from *url*.

    Called once from lifespan startup.  No-ops if the redis package is not
    installed so the app degrades gracefully in minimal environments.
    """
    global _sync_client, _async_client
    if not _REDIS_AVAILABLE:
        _logger.warning("redis package not installed — Redis features disabled")
        return
    _sync_client = _redis.Redis.from_url(url, decode_responses=False)
    _async_client = _aioredis.Redis.from_url(url, decode_responses=False)
    _logger.debug("Redis clients configured")


def get_sync():
    """Return the synchronous Redis client, or None if not configured."""
    return _sync_client


def get_async():
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
