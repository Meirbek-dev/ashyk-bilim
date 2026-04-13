"""Redis sliding-window rate limiter for auth endpoints (async).

Uses a sorted set per key: members are random tokens, scores are timestamps.
All functions are async and use the async Redis client so they never block
the asyncio event loop.
"""

import logging
import secrets
import time

from src.services.cache.redis_client import get_async_redis_client

logger = logging.getLogger(__name__)


class RateLimitExceeded(Exception):
    """Raised when the rate limit for an action is exceeded."""

    def __init__(self, retry_after: int) -> None:
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded. Retry after {retry_after}s")


async def check_rate_limit(
    *,
    key: str,
    max_requests: int,
    window_seconds: int,
) -> None:
    """Check a sliding-window rate limit (async).

    Raises RateLimitExceeded if the limit is breached.
    key: unique identifier (e.g. "login:ip:1.2.3.4" or "login:email:foo@bar.com")
    If Redis is unavailable, the check is skipped (fail-open) so auth is never
    blocked by infrastructure issues.
    """
    r = get_async_redis_client()
    if not r:
        return  # Redis unavailable – fail open

    now = time.time()
    window_start = now - window_seconds
    redis_key = f"rl:{key}"

    try:
        async with r.pipeline(transaction=False) as pipe:
            # Remove entries outside the window
            await pipe.zremrangebyscore(redis_key, 0, window_start)
            # Count entries within the window
            await pipe.zcard(redis_key)
            # Add current request
            await pipe.zadd(redis_key, {secrets.token_hex(8): now})
            # Expire the set after the window to avoid unbounded growth
            await pipe.expire(redis_key, window_seconds + 1)
            results = await pipe.execute()
    except Exception:
        return  # Redis error – fail open, same as unavailable

    current_count = results[1]
    if current_count >= max_requests:
        raise RateLimitExceeded(retry_after=window_seconds)


async def check_account_locked(email: str) -> bool:
    """Return True if the account is currently locked due to too many failures."""
    r = get_async_redis_client()
    if not r:
        return False
    return bool(await r.exists(f"account_locked:{email.lower()}"))


async def record_login_failure(
    email: str, *, lock_after: int = 5, lock_duration: int = 900
) -> None:
    """Record a failed login attempt and lock the account if threshold is reached.

    When the lockout threshold is reached for the first time, enqueues a
    lockout notification email to warn the user about suspicious activity.
    """
    r = get_async_redis_client()
    if not r:
        return

    counter_key = f"login_failures:{email.lower()}"
    count = await r.incr(counter_key)
    await r.expire(counter_key, lock_duration)

    if count >= lock_after:
        lock_key = f"account_locked:{email.lower()}"
        # Only send notification the first time the lock is set
        was_locked = await r.exists(lock_key)
        await r.set(lock_key, "1", ex=lock_duration)

        if not was_locked:
            _send_lockout_notification(email)


def _send_lockout_notification(email: str) -> None:
    """Send a lockout notification email (best-effort, non-blocking).

    Uses fire-and-forget asyncio.create_task so the login flow is never
    blocked by email delivery.
    """
    import asyncio

    async def _send() -> None:
        try:
            from src.services.users.emails import send_lockout_notification_email

            send_lockout_notification_email(email=email)
        except Exception:
            logger.warning("Failed to send lockout notification to %s", email)

    try:
        asyncio.create_task(_send())
    except RuntimeError:
        # No event loop running — skip notification
        pass


async def clear_login_failures(email: str) -> None:
    """Clear the failure counter on successful login."""
    r = get_async_redis_client()
    if not r:
        return
    await r.delete(f"login_failures:{email.lower()}")
