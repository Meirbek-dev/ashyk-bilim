"""In-process async event bus with retry and dead-letter logging.

Design:
- Handlers are registered per event type.
- Dispatch is fire-and-forget from the caller's perspective (post-commit).
- Each handler gets up to 3 attempts with exponential backoff.
- Failed handlers are logged to a dead-letter list (observable via internal API).
- Handlers MUST be idempotent — replay is always safe.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")
Handler = Callable[[Any], Coroutine[Any, Any, None]]

MAX_RETRIES = 3
BACKOFF_BASE_SECONDS = 2.0


@dataclass
class DeadLetterEntry:
    """Record of a handler that exhausted all retries."""

    event: object
    handler_name: str
    error: str
    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class EventBus:
    """Typed async event bus with bounded retry."""

    def __init__(self) -> None:
        self._handlers: dict[type, list[Handler]] = defaultdict(list)
        self._dead_letters: list[DeadLetterEntry] = []

    def subscribe(self, event_type: type[T], handler: Handler) -> None:
        """Register a handler for an event type."""
        self._handlers[event_type].append(handler)

    def unsubscribe(self, event_type: type[T], handler: Handler) -> None:
        """Remove a handler (useful in tests)."""
        handlers = self._handlers.get(event_type, [])
        if handler in handlers:
            handlers.remove(handler)

    async def emit(self, event: object) -> None:
        """Dispatch an event to all registered handlers.

        Each handler is invoked independently — a failure in one does not
        prevent others from running. Failed handlers are retried up to
        MAX_RETRIES times with exponential backoff.
        """
        event_type = type(event)
        handlers = self._handlers.get(event_type, [])
        if not handlers:
            return

        tasks = [self._dispatch(handler, event) for handler in handlers]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _dispatch(self, handler: Handler, event: object) -> None:
        """Invoke a single handler with retry logic."""
        handler_name = getattr(handler, "__qualname__", str(handler))
        for attempt in range(MAX_RETRIES):
            try:
                await handler(event)
                return
            except Exception as exc:
                if attempt < MAX_RETRIES - 1:
                    wait = BACKOFF_BASE_SECONDS**attempt
                    logger.warning(
                        "event_handler_retry handler=%s attempt=%d error=%s",
                        handler_name,
                        attempt + 1,
                        exc,
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.exception(
                        "event_dead_letter handler=%s event=%s",
                        handler_name,
                        type(event).__name__,
                    )
                    self._dead_letters.append(
                        DeadLetterEntry(
                            event=event,
                            handler_name=handler_name,
                            error=str(exc),
                        )
                    )

    @property
    def dead_letters(self) -> list[DeadLetterEntry]:
        """Observable dead-letter queue for diagnostics."""
        return list(self._dead_letters)

    def clear_dead_letters(self) -> int:
        """Clear the dead-letter queue. Returns the number of entries cleared."""
        count = len(self._dead_letters)
        self._dead_letters.clear()
        return count


# ── Singleton ─────────────────────────────────────────────────────────────────

_bus: EventBus | None = None


def get_event_bus() -> EventBus:
    """Return the application-wide event bus singleton."""
    global _bus
    if _bus is None:
        _bus = EventBus()
    return _bus


def reset_event_bus() -> None:
    """Reset the singleton (for tests only)."""
    global _bus
    _bus = None
