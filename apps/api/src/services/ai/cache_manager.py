"""
Cache manager for AI services.

AICacheManager holds TTL caches for retrieval collections, agents, and DB query results.
It also tracks which cache keys belong to which activity so they can be
invalidated atomically when content changes.
"""

import logging
from threading import Lock
from typing import Any

from cachetools import TTLCache

from config.config import get_settings

logger = logging.getLogger(__name__)


class _Cache:
    """Thread-safe TTL cache wrapper (thin — no metrics, no async indirection)."""

    __slots__ = ("_cache", "_lock")

    def __init__(self, maxsize: int, ttl: int) -> None:
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)
        self._lock = Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            return self._cache.get(key)

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._cache[key] = value

    def delete(self, key: str) -> None:
        with self._lock:
            self._cache.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._cache)


class AICacheManager:
    """Centralized cache manager for AI-related caches."""

    def __init__(self) -> None:
        settings = get_settings()
        retrieval_ttl = settings.ai_config.collection_retention
        self.retrieval_cache = _Cache(maxsize=100, ttl=retrieval_ttl)
        self.agent_cache = _Cache(maxsize=100, ttl=1800)  # 30 min
        self.db_cache = _Cache(maxsize=200, ttl=300)  # 5 min

        # Secondary index: activity_uuid → set of cache keys for targeted invalidation
        self._retrieval_key_index: dict[str, set[str]] = {}
        self._agent_key_index: dict[str, set[str]] = {}
        self._index_lock = Lock()

        logger.info("AI Cache Manager initialized")

    def register_retrieval_cache_key(self, activity_uuid: str, cache_key: str) -> None:
        with self._index_lock:
            self._retrieval_key_index.setdefault(activity_uuid, set()).add(cache_key)

    def register_agent_cache_key(self, activity_uuid: str, cache_key: str) -> None:
        with self._index_lock:
            self._agent_key_index.setdefault(activity_uuid, set()).add(cache_key)

    def invalidate_activity_cache(self, activity_uuid: str) -> None:
        """Invalidate all caches related to a specific activity."""
        self.db_cache.delete(f"activity_{activity_uuid}")
        self.db_cache.delete(f"context_text_{activity_uuid}")

        with self._index_lock:
            retrieval_keys = self._retrieval_key_index.pop(activity_uuid, set())
            agent_keys = self._agent_key_index.pop(activity_uuid, set())

        for key in retrieval_keys:
            self.retrieval_cache.delete(key)
        for key in agent_keys:
            self.agent_cache.delete(key)

        logger.info(
            "Invalidated caches for activity %s: %d retrieval, %d agent entries cleared",
            activity_uuid,
            len(retrieval_keys),
            len(agent_keys),
        )

    def clear_all(self) -> None:
        self.retrieval_cache.clear()
        self.agent_cache.clear()
        self.db_cache.clear()
        with self._index_lock:
            self._retrieval_key_index.clear()
            self._agent_key_index.clear()
        logger.info("All AI caches cleared")

    def get_all_stats(self) -> dict[str, Any]:
        with self._index_lock:
            retrieval_index_size = sum(
                len(v) for v in self._retrieval_key_index.values()
            )
            agent_index_size = sum(len(v) for v in self._agent_key_index.values())
        return {
            "retrieval": {"size": len(self.retrieval_cache)},
            "agent": {"size": len(self.agent_cache)},
            "database": {"size": len(self.db_cache)},
            "retrieval_key_index_entries": retrieval_index_size,
            "agent_key_index_entries": agent_index_size,
        }


_cache_manager: AICacheManager | None = None
_cache_manager_lock = Lock()


def get_ai_cache_manager() -> AICacheManager:
    """Return the process-wide AICacheManager instance."""
    global _cache_manager
    if _cache_manager is None:
        with _cache_manager_lock:
            if _cache_manager is None:
                _cache_manager = AICacheManager()
    return _cache_manager
