import asyncio
import hashlib
import secrets
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from cachebox import TTLCache
from fastapi import HTTPException, Request, status

from src.services.cache.redis_client import get_async_redis_client


@dataclass(frozen=True, slots=True)
class RateLimitRule:
    namespace: str
    max_requests: int
    window_seconds: int


RateLimitKeyFunc = Callable[[Request], str | Awaitable[str]]

_LOCAL_LIMITS: TTLCache[str, list[float]] = TTLCache(maxsize=20_000, global_ttl=3600)
_LOCAL_LIMIT_LOCK = asyncio.Lock()


def client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip() or "unknown"
    return request.client.host if request.client else "unknown"


def auth_or_ip_key(request: Request) -> str:
    user_header = request.headers.get("x-user-id")
    if user_header:
        return f"user:{user_header}"

    auth = request.headers.get("authorization")
    if auth:
        digest = hashlib.sha256(auth.encode()).hexdigest()
        return f"auth:{digest}"

    return f"ip:{client_ip(request)}"


def ip_key(request: Request) -> str:
    return f"ip:{client_ip(request)}"


async def _resolve_key(request: Request, key_func: RateLimitKeyFunc) -> str:
    value = key_func(request)
    if isinstance(value, Awaitable):
        value = await value
    return value


async def _redis_check(key: str, rule: RateLimitRule) -> int | None:
    redis = get_async_redis_client()
    if redis is None:
        return None

    now = time.time()
    window_start = now - rule.window_seconds
    member = f"{now}:{secrets.token_hex(8)}"

    async with redis.pipeline(transaction=True) as pipe:
        await pipe.zremrangebyscore(key, 0, window_start)
        await pipe.zcard(key)
        await pipe.zadd(key, {member: now})
        await pipe.expire(key, rule.window_seconds + 1)
        results = await pipe.execute()

    request_count = int(results[1])
    if request_count >= rule.max_requests:
        return rule.window_seconds
    return None


async def _local_check(key: str, rule: RateLimitRule) -> int | None:
    now = time.time()
    window_start = now - rule.window_seconds

    async with _LOCAL_LIMIT_LOCK:
        timestamps = [timestamp for timestamp in _LOCAL_LIMITS.get(key, []) if timestamp >= window_start]
        if len(timestamps) >= rule.max_requests:
            oldest = min(timestamps)
            retry_after = max(1, int(rule.window_seconds - (now - oldest)))
            _LOCAL_LIMITS[key] = timestamps
            return retry_after
        timestamps.append(now)
        _LOCAL_LIMITS[key] = timestamps
    return None


async def check_rate_limit(key: str, rule: RateLimitRule) -> None:
    redis_key = f"rl:{rule.namespace}:{key}"
    try:
        retry_after = await _redis_check(redis_key, rule)
    except Exception:
        retry_after = await _local_check(redis_key, rule)
    else:
        if retry_after is None and get_async_redis_client() is None:
            retry_after = await _local_check(redis_key, rule)

    if retry_after is None:
        return

    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "error_code": "RATE_LIMIT_EXCEEDED",
            "message": "Too many requests. Please try again later.",
            "retry_after": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )


def rate_limit_dependency(
    *,
    namespace: str,
    max_requests: int,
    window_seconds: int,
    key_func: RateLimitKeyFunc = ip_key,
):
    rule = RateLimitRule(
        namespace=namespace,
        max_requests=max_requests,
        window_seconds=window_seconds,
    )

    async def dependency(request: Request) -> None:
        key = await _resolve_key(request, key_func)
        await check_rate_limit(key, rule)

    return dependency
