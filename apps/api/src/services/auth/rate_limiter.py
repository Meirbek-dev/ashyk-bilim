"""Redis sliding-window rate limiter for auth endpoints."""

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
    """Check a sliding-window rate limit."""
    r = get_async_redis_client()
    if not r:
        return

    now = time.time()
    window_start = now - window_seconds
    redis_key = f"rl:{key}"

    try:
        async with r.pipeline(transaction=False) as pipe:
            await pipe.zremrangebyscore(redis_key, 0, window_start)
            await pipe.zcard(redis_key)
            await pipe.zadd(redis_key, {secrets.token_hex(8): now})
            await pipe.expire(redis_key, window_seconds + 1)
            results = await pipe.execute()
    except Exception:
        return

    current_count = results[1]
    if current_count >= max_requests:
        raise RateLimitExceeded(retry_after=window_seconds)


async def check_account_locked(email: str) -> bool:
    """Return True if the account is currently locked."""
    r = get_async_redis_client()
    if not r:
        return False
    try:
        return bool(await r.exists(f"account_locked:{email.lower()}"))
    except Exception:
        logger.warning(
            "Redis error in check_account_locked; failing open", exc_info=True
        )
        return False


async def record_login_failure(
    email: str,
    *,
    lock_after: int = 5,
    lock_duration: int = 900,
) -> None:
    """Record a failed login attempt and lock the account if needed."""
    r = get_async_redis_client()
    if not r:
        return

    counter_key = f"login_failures:{email.lower()}"
    count = await r.incr(counter_key)
    await r.expire(counter_key, lock_duration)

    if count >= lock_after:
        lock_key = f"account_locked:{email.lower()}"
        was_locked = await r.exists(lock_key)
        await r.set(lock_key, "1", ex=lock_duration)

        if not was_locked:
            await _send_lockout_notification(email)


async def _send_lockout_notification(email: str) -> None:
    from src.services.users.emails import enqueue_lockout_notification_email

    await enqueue_lockout_notification_email(email=email)


async def clear_login_failures(email: str) -> None:
    """Clear the failure counter on successful login."""
    r = get_async_redis_client()
    if not r:
        return
    await r.delete(f"login_failures:{email.lower()}")
