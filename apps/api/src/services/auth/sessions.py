"""Session management - Redis-primary (async), PostgreSQL audit-only.

Redis data model for user sessions:
  session:{session_id}          → JSON-encoded SessionData, TTL = sliding window
  user_sessions:{user_id}       → Sorted Set  score=absolute_expires_at
                                  Members are session_ids. Expired members are
                                  pruned on every write so the set never grows
                                  unboundedly.

Audit writes use their own short-lived DB session (via get_bg_engine())
and are fire-and-forget via asyncio.create_task + asyncio.to_thread, so they
never block the event-loop.
"""

import asyncio
import hashlib
import json
import logging
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import HTTPException, status
from sqlmodel import Session, select

from src.db.auth_sessions import AuthSession
from src.db.users import User
from src.security.auth_lifetimes import (
    REFRESH_TOKEN_EXPIRE,
    REFRESH_TOKEN_HARD_CAP_EXPIRE,
)
from src.services.cache.redis_client import get_async_redis_client

logger = logging.getLogger(__name__)

REFRESH_SESSION_TTL = int(REFRESH_TOKEN_EXPIRE.total_seconds())
REFRESH_SESSION_HARD_CAP = int(REFRESH_TOKEN_HARD_CAP_EXPIRE.total_seconds())
MAX_SESSIONS_PER_USER = 10
SESSION_PREFIX = "session:"
USER_SESSIONS_PREFIX = "user_sessions:"

RefreshSessionStatus = Literal["active", "expired", "revoked", "reused", "invalid"]


@dataclass(slots=True)
class SessionData:
    session_id: str
    token_family_id: str
    user_id: int
    user_uuid: str
    refresh_token_hash: str
    ip_address: str | None
    user_agent: str | None
    created_at: int
    last_seen_at: int
    rotated_count: int
    absolute_expires_at: int


@dataclass(slots=True)
class RefreshSessionInspection:
    status: RefreshSessionStatus
    session: SessionData | None = None
    session_id: str | None = None
    token_family_id: str | None = None
    user_id: int | None = None


# ── Utility helpers ──────────────────────────────────────────────────────────


def _now_ts() -> int:
    return int(time.time())


def _generate_session_id() -> str:
    return "sess_" + secrets.token_hex(16)


def _generate_family_id() -> str:
    return "fam_" + secrets.token_hex(16)


def _generate_refresh_token(session_id: str) -> str:
    return session_id + "." + secrets.token_hex(32)


def _extract_session_id(refresh_token: str) -> str | None:
    parts = refresh_token.split(".", 1)
    if len(parts) != 2:
        return None
    session_id = parts[0].strip()
    return session_id or None


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _session_key(session_id: str) -> str:
    return SESSION_PREFIX + session_id


def _user_sessions_key(user_id: int) -> str:
    return USER_SESSIONS_PREFIX + str(user_id)


def _redis_key_type_name(key_type: bytes | str) -> str:
    if isinstance(key_type, bytes):
        return key_type.decode("utf-8", errors="ignore")
    return key_type


async def _ensure_user_sessions_index(r, user_id: int) -> str:
    """Normalize the per-user session index to a sorted set.

    Older deployments may have written a non-zset value under the same key.
    Delete those stale keys before issuing zset commands so auth flows recover
    automatically instead of failing with WRONGTYPE.
    """
    user_key = _user_sessions_key(user_id)
    key_type = _redis_key_type_name(await r.type(user_key))
    if key_type not in {"zset", "none"}:
        logger.warning("Deleting stale Redis key %s with type %s", user_key, key_type)
        await r.delete(user_key)
    return user_key


def _session_data_to_dict(data: SessionData) -> dict:
    return {
        "session_id": data.session_id,
        "token_family_id": data.token_family_id,
        "user_id": data.user_id,
        "user_uuid": data.user_uuid,
        "refresh_token_hash": data.refresh_token_hash,
        "ip_address": data.ip_address,
        "user_agent": data.user_agent,
        "created_at": data.created_at,
        "last_seen_at": data.last_seen_at,
        "rotated_count": data.rotated_count,
        "absolute_expires_at": data.absolute_expires_at,
    }


def _parse_session_data(raw: bytes | str) -> SessionData | None:
    try:
        d = json.loads(raw)
        return SessionData(**d)
    except Exception:
        return None


# ── Redis operations (Sorted Set) ─────────────────────────────────────────────


async def _write_session_to_redis(data: SessionData, ttl: int) -> None:
    """Write session to Redis.

    The user-sessions index uses a Sorted Set with score=absolute_expires_at.
    On every write expired members are pruned so the set never grows unboundedly.
    The set's own TTL is set to the member's absolute_expires_at so Redis
    auto-cleans empty sets.
    """
    r = get_async_redis_client()
    if not r:
        return
    now = _now_ts()
    payload = json.dumps(_session_data_to_dict(data))
    user_key = await _ensure_user_sessions_index(r, data.user_id)
    async with r.pipeline(transaction=False) as pipe:
        # Session data with sliding-window TTL
        await pipe.set(_session_key(data.session_id), payload, ex=ttl)
        # Sorted Set: score = absolute_expires_at → enables range queries by expiry
        await pipe.zadd(user_key, {data.session_id: data.absolute_expires_at})
        # Prune already-expired members (score < now)
        await pipe.zremrangebyscore(user_key, 0, now - 1)
        # Set the set's TTL to the hard cap so Redis cleans empty sets automatically
        await pipe.expireat(user_key, data.absolute_expires_at + 60)
        await pipe.execute()


async def _read_session_from_redis(session_id: str) -> SessionData | None:
    r = get_async_redis_client()
    if not r:
        return None
    try:
        raw = await r.get(_session_key(session_id))
    except Exception:
        logger.warning("Redis error reading session %s", session_id)
        return None
    if not raw:
        return None
    data = _parse_session_data(raw)
    if data is None:
        logger.warning("Corrupt session in Redis: %s", session_id)
    return data


async def _delete_session_from_redis(session_id: str, user_id: int) -> None:
    r = get_async_redis_client()
    if not r:
        return
    user_key = await _ensure_user_sessions_index(r, user_id)
    async with r.pipeline(transaction=False) as pipe:
        await pipe.delete(_session_key(session_id))
        await pipe.zrem(user_key, session_id)
        await pipe.execute()


async def _find_session_by_refresh_token(refresh_token: str) -> SessionData | None:
    session_id = _extract_session_id(refresh_token)
    if session_id is None:
        return None
    data = await _read_session_from_redis(session_id)
    if data is None:
        return None
    if data.refresh_token_hash != hash_refresh_token(refresh_token):
        return None
    return data


async def _get_active_session_ids(user_id: int) -> list[str]:
    """Return active (non-expired) session IDs for a user using the Sorted Set index."""
    r = get_async_redis_client()
    if not r:
        return []
    now = _now_ts()
    user_key = await _ensure_user_sessions_index(r, user_id)
    members = await r.zrangebyscore(user_key, now, "+inf")
    return [m.decode() if isinstance(m, bytes) else m for m in members]


# ── Background audit helpers (own DB session, non-blocking) ──────────────────


def _audit_create_sync(session_data_dict: dict) -> None:
    """Write a session-created audit record using its own short-lived DB session."""
    try:
        from src.infra.db.engine import get_bg_engine

        engine = get_bg_engine()
        with Session(engine) as db:
            now = datetime.now(UTC)
            record = AuthSession(
                session_id=session_data_dict["session_id"],
                token_family_id=session_data_dict["token_family_id"],
                user_id=session_data_dict["user_id"],
                refresh_token_hash=session_data_dict["refresh_token_hash"],
                created_at=now,
                last_seen_at=now,
                expires_at=now + timedelta(seconds=REFRESH_SESSION_TTL),
                ip_address=session_data_dict["ip_address"],
                user_agent=session_data_dict["user_agent"],
            )
            db.add(record)
            db.commit()
    except Exception:
        logger.warning(
            "Audit create failed for session %s", session_data_dict.get("session_id")
        )


def _audit_revoke_sync(session_id: str) -> None:
    """Mark a session as revoked using its own short-lived DB session."""
    try:
        from src.infra.db.engine import get_bg_engine

        engine = get_bg_engine()
        with Session(engine) as db:
            record = db.exec(
                select(AuthSession).where(AuthSession.session_id == session_id)
            ).first()
            if record and record.revoked_at is None:
                record.revoked_at = datetime.now(UTC)
                db.add(record)
                db.commit()
    except Exception:
        logger.warning("Audit revoke failed for session %s", session_id)


def _audit_rotate_sync(
    old_session_id: str, new_session_id: str, new_session_dict: dict
) -> None:
    """Mark old session as rotated and create new session record, in one DB session."""
    try:
        from src.infra.db.engine import get_bg_engine

        engine = get_bg_engine()
        with Session(engine) as db:
            now = datetime.now(UTC)
            # Mark old session as rotated
            old_record = db.exec(
                select(AuthSession).where(AuthSession.session_id == old_session_id)
            ).first()
            if old_record is not None:
                old_record.revoked_at = now
                old_record.rotated_at = now
                old_record.replaced_by_session_id = new_session_id
                db.add(old_record)

            # Create new session record
            new_record = AuthSession(
                session_id=new_session_dict["session_id"],
                token_family_id=new_session_dict["token_family_id"],
                user_id=new_session_dict["user_id"],
                refresh_token_hash=new_session_dict["refresh_token_hash"],
                created_at=now,
                last_seen_at=now,
                expires_at=now + timedelta(seconds=REFRESH_SESSION_TTL),
                ip_address=new_session_dict["ip_address"],
                user_agent=new_session_dict["user_agent"],
            )
            db.add(new_record)
            db.commit()
    except Exception:
        logger.warning(
            "Audit rotate failed for sessions %s → %s", old_session_id, new_session_id
        )


def _fire_audit_create(data: SessionData) -> None:
    """Schedule a non-blocking background audit write for a new session."""
    asyncio.create_task(
        asyncio.to_thread(_audit_create_sync, _session_data_to_dict(data))
    )


def _fire_audit_revoke(session_id: str) -> None:
    """Schedule a non-blocking background audit write for a revoked session."""
    asyncio.create_task(asyncio.to_thread(_audit_revoke_sync, session_id))


def _fire_audit_rotate(
    old_session_id: str, new_session_id: str, new_data: SessionData
) -> None:
    """Schedule a non-blocking background audit write for a rotated session."""
    asyncio.create_task(
        asyncio.to_thread(
            _audit_rotate_sync,
            old_session_id,
            new_session_id,
            _session_data_to_dict(new_data),
        )
    )


# ── Public API ────────────────────────────────────────────────────────────────


async def create_auth_session(
    *,
    user: User,
    ip_address: str | None,
    user_agent: str | None,
    token_family_id: str | None = None,
) -> tuple[SessionData, str]:
    """Create a new auth session in Redis and schedule an async audit write.

    Enforces a maximum of MAX_SESSIONS_PER_USER active sessions.  When the
    limit is reached, the oldest session (lowest score in the sorted set) is
    evicted automatically.

    No DB session required — audit uses its own engine connection.
    """
    # Enforce session concurrency limit
    active_ids = await _get_active_session_ids(user.id)
    if len(active_ids) >= MAX_SESSIONS_PER_USER:
        # Evict oldest sessions until we're under the limit
        sessions_to_evict = active_ids[: len(active_ids) - MAX_SESSIONS_PER_USER + 1]
        for oldest_sid in sessions_to_evict:
            await _delete_session_from_redis(oldest_sid, user.id)
            _fire_audit_revoke(oldest_sid)

    now = _now_ts()
    session_id = _generate_session_id()
    refresh_token = _generate_refresh_token(session_id)
    data = SessionData(
        session_id=session_id,
        token_family_id=token_family_id or _generate_family_id(),
        user_id=user.id,
        user_uuid=str(user.user_uuid),
        refresh_token_hash=hash_refresh_token(refresh_token),
        ip_address=ip_address,
        user_agent=user_agent,
        created_at=now,
        last_seen_at=now,
        rotated_count=0,
        absolute_expires_at=now + REFRESH_SESSION_HARD_CAP,
    )
    try:
        await _write_session_to_redis(data, REFRESH_SESSION_TTL)
    except Exception as exc:
        logger.exception("Redis unavailable — cannot persist session: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service temporarily unavailable",
        ) from exc
    _fire_audit_create(data)
    return data, refresh_token


async def get_session_by_id(session_id: str) -> SessionData | None:
    return await _read_session_from_redis(session_id)


async def get_session_owner_id(
    db_session: Session | None, session_id: str
) -> int | None:
    active = await _read_session_from_redis(session_id)
    if active is not None:
        return active.user_id

    if db_session is None:
        return None

    try:
        record = db_session.exec(
            select(AuthSession).where(AuthSession.session_id == session_id)
        ).first()
        return record.user_id if record else None
    except Exception:
        logger.warning("Failed to resolve owner for session %s", session_id)
        return None


async def inspect_refresh_session(
    db_session: Session, refresh_token: str
) -> RefreshSessionInspection:
    """Inspect a refresh token and return its status.

    Still accepts db_session for the PostgreSQL fallback read path (reuse/revoke
    detection when the session has expired from Redis).  Audit writes are async.
    """
    session_id = _extract_session_id(refresh_token)
    if session_id is None:
        return RefreshSessionInspection(status="invalid")

    data = await _find_session_by_refresh_token(refresh_token)
    if data is not None:
        now = _now_ts()
        if now >= data.absolute_expires_at:
            await _delete_session_from_redis(data.session_id, data.user_id)
            _fire_audit_revoke(data.session_id)
            return RefreshSessionInspection(
                status="expired",
                session_id=data.session_id,
                token_family_id=data.token_family_id,
                user_id=data.user_id,
            )

        # Slide the window: update last_seen_at and rewrite with remaining TTL
        data.last_seen_at = now
        remaining = min(REFRESH_SESSION_TTL, data.absolute_expires_at - now)
        await _write_session_to_redis(data, remaining)
        return RefreshSessionInspection(
            status="active",
            session=data,
            session_id=data.session_id,
            token_family_id=data.token_family_id,
            user_id=data.user_id,
        )

    # Session not in Redis — check PostgreSQL for reuse / revocation diagnosis.
    # This is a READ-only path; any resulting audit writes are also fire-and-forget.
    record = db_session.exec(
        select(AuthSession).where(AuthSession.session_id == session_id)
    ).first()
    if record is None:
        return RefreshSessionInspection(status="invalid", session_id=session_id)

    if record.refresh_token_hash != hash_refresh_token(refresh_token):
        return RefreshSessionInspection(
            status="invalid",
            session_id=session_id,
            token_family_id=record.token_family_id,
            user_id=record.user_id,
        )

    now_dt = datetime.now(UTC)
    if record.expires_at <= now_dt:
        return RefreshSessionInspection(
            status="expired",
            session_id=session_id,
            token_family_id=record.token_family_id,
            user_id=record.user_id,
        )

    # Token hash matches but session is gone from Redis — it was either
    # rotated (replaced_by_session_id is set) or explicitly revoked.
    return RefreshSessionInspection(
        status="reused" if record.replaced_by_session_id else "revoked",
        session_id=session_id,
        token_family_id=record.token_family_id,
        user_id=record.user_id,
    )


async def rotate_session(
    *,
    old_session: SessionData,
    user: User,
    ip_address: str | None,
    user_agent: str | None,
) -> tuple[SessionData, str]:
    """Rotate a refresh session.  No DB session required — audit is async."""
    now = _now_ts()
    await _delete_session_from_redis(old_session.session_id, old_session.user_id)

    new_session_id = _generate_session_id()
    new_refresh_token = _generate_refresh_token(new_session_id)
    new_data = SessionData(
        session_id=new_session_id,
        token_family_id=old_session.token_family_id,
        user_id=old_session.user_id,
        user_uuid=old_session.user_uuid,
        refresh_token_hash=hash_refresh_token(new_refresh_token),
        ip_address=ip_address,
        user_agent=user_agent,
        created_at=now,
        last_seen_at=now,
        rotated_count=old_session.rotated_count + 1,
        absolute_expires_at=old_session.absolute_expires_at,
    )
    remaining = max(1, min(REFRESH_SESSION_TTL, old_session.absolute_expires_at - now))
    await _write_session_to_redis(new_data, remaining)
    _fire_audit_rotate(old_session.session_id, new_session_id, new_data)
    return new_data, new_refresh_token


async def revoke_session(session_id: str, user_id: int) -> None:
    """Revoke a single session.  No DB session required — audit is async."""
    await _delete_session_from_redis(session_id, user_id)
    _fire_audit_revoke(session_id)


async def revoke_token_family(token_family_id: str, user_id: int) -> None:
    """Revoke all sessions belonging to a token family.  Audit is async."""
    active_ids = await _get_active_session_ids(user_id)
    for sid in active_ids:
        data = await _read_session_from_redis(sid)
        if data and data.token_family_id == token_family_id:
            await _delete_session_from_redis(sid, user_id)
            _fire_audit_revoke(sid)


async def revoke_all_user_sessions(user_id: int) -> int:
    """Revoke all active sessions for a user.  Returns count revoked.  Audit is async."""
    r = get_async_redis_client()
    if not r:
        return 0
    user_key = await _ensure_user_sessions_index(r, user_id)
    active_ids = await _get_active_session_ids(user_id)
    if not active_ids:
        return 0

    session_keys = [_session_key(sid) for sid in active_ids]
    async with r.pipeline(transaction=False) as pipe:
        for key in session_keys:
            await pipe.delete(key)
        # Remove all members from the sorted set and delete the set
        await pipe.delete(user_key)
        await pipe.execute()

    for sid in active_ids:
        _fire_audit_revoke(sid)

    return len(active_ids)


async def get_user_active_sessions(user_id: int) -> list[dict]:
    """Return metadata for all active sessions of a user."""
    active_ids = await _get_active_session_ids(user_id)
    result = []
    for sid in active_ids:
        data = await _read_session_from_redis(sid)
        if data:
            result.append({
                "session_id": data.session_id,
                "ip_address": data.ip_address,
                "user_agent": data.user_agent,
                "created_at": data.created_at,
                "last_seen_at": data.last_seen_at,
            })
    return result
