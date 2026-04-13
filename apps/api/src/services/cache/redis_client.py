"""Redis helpers — thin shim over src.infra.redis.

Public API (backward-compatible):
  get_redis_client()       -> sync client or None
  get_async_redis_client() -> async client or None
  get_json / set_json / delete_keys convenience helpers

Clients are configured during lifespan startup via src.infra.redis.configure().
There are no module-level connection pools here.
"""

from __future__ import annotations

import json
import logging

from src.infra import redis as _infra_redis

_logger = logging.getLogger(__name__)


def get_redis_client():
    """Return the synchronous Redis client, or None if not configured."""
    return _infra_redis.get_sync()


def get_async_redis_client():
    """Return the asynchronous Redis client, or None if not configured."""
    return _infra_redis.get_async()


def get_json(key: str) -> dict | None:
    r = get_redis_client()
    if not r:
        return None
    try:
        raw = r.get(key)
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        _logger.exception("redis get_json failed for key=%s", key)
        return None


def set_json(key: str, value: object, ttl: int | None = None) -> None:
    r = get_redis_client()
    if not r:
        return
    try:
        payload = json.dumps(value, default=str).encode()
        if ttl:
            r.setex(key, ttl, payload)
        else:
            r.set(key, payload)
    except Exception:
        _logger.exception("redis set_json failed for key=%s", key)


def delete_keys(*keys: str) -> None:
    r = get_redis_client()
    if not r:
        return
    try:
        if keys:
            r.delete(*keys)
    except Exception:
        _logger.exception("redis delete_keys failed: %s", keys)
