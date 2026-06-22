"""Session management - Redis-primary (async), PostgreSQL audit-only.

Redis data model for user sessions:
  session:{session_id}          → JSON-encoded SessionData, TTL = sliding window
  user_sessions:{user_id}       → Sorted Set  score=absolute_expires_at
                                  Members are session_ids. Expired members are
                                  pruned on every write so the set never grows
                                  unboundedly.

Audit writes are enqueued through Taskiq and use their own short-lived DB
session in the worker process.
"""

import hashlib
import json
import logging
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import redis.asyncio
from sqlmodel import Session, select

from src.app.exceptions import DependencyAppError
from src.db.auth_sessions import AuthSession
from src.db.users import User
from src.security.auth_lifetimes import (
    REFRESH_TOKEN_EXPIRE,
    REFRESH_TOKEN_HARD_CAP_EXPIRE,
)
from src.services.cache.redis_client import get_async_redis_client
from src.types import JsonObject, require_persisted_id
from src.types.narrowing import as_int, as_str

logger = logging.getLogger(__name__)

REFRESH_SESSION_TTL = int(REFRESH_TOKEN_EXPIRE.total_seconds())
REFRESH_SESSION_HARD_CAP = int(REFRESH_TOKEN_HARD_CAP_EXPIRE.total_seconds())
REFRESH_ROTATION_GRACE_SECONDS = 10
MAX_SESSIONS_PER_USER = 10
SESSION_PREFIX = "session:"
USER_SESSIONS_PREFIX = "user_sessions:"
ROTATED_SESSION_PREFIX = "rotated_session:"

RefreshSessionStatus = Literal["active", "expired", "revoked", "reused", "rotated", "invalid"]


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


def _optional_str(value: object, *, field: str) -> str | None:
    if value is None:
        return None
    return as_str(value, field=field)


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


def _rotated_session_key(session_id: str) -> str:
    return ROTATED_SESSION_PREFIX + session_id


def _redis_key_type_name(key_type: bytes | str) -> str:
    if isinstance(key_type, bytes):
        return key_type.decode("utf-8", errors="ignore")
    return key_type


async def _ensure_user_sessions_index(r: redis.asyncio.Redis, user_id: int) -> str:
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


def _session_data_to_dict(data: SessionData) -> JsonObject:
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


def _rotation_grace_payload(old_session: SessionData, new_session: SessionData, *, rotated_at: int) -> JsonObject:
    return {
        "session_id": old_session.session_id,
        "token_family_id": old_session.token_family_id,
        "user_id": old_session.user_id,
        "refresh_token_hash": old_session.refresh_token_hash,
        "replaced_by_session_id": new_session.session_id,
        "rotated_at": rotated_at,
    }


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


async def _write_rotation_grace(old_session: SessionData, new_session: SessionData, *, rotated_at: int) -> None:
    r = get_async_redis_client()
    if not r:
        return

    payload = json.dumps(_rotation_grace_payload(old_session, new_session, rotated_at=rotated_at))
    await r.set(_rotated_session_key(old_session.session_id), payload, ex=REFRESH_ROTATION_GRACE_SECONDS)


async def _read_rotation_grace(session_id: str) -> JsonObject | None:
    r = get_async_redis_client()
    if not r:
        return None

    try:
        raw = await r.get(_rotated_session_key(session_id))
    except Exception:
        logger.warning("Redis error reading refresh rotation grace for %s", session_id)
        return None

    if not raw:
        return None

    try:
        data = json.loads(raw)
    except Exception:
        logger.warning("Corrupt refresh rotation grace payload for %s", session_id)
        return None

    return data if isinstance(data, dict) else None


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


def audit_create_sync(session_data_dict: JsonObject) -> None:
    """Write a session-created audit record using its own short-lived DB session."""
    try:
        from src.infra.db.engine import get_bg_engine

        engine = get_bg_engine()
        with Session(engine) as db:
            existing = db.exec(
                select(AuthSession).where(AuthSession.session_id == session_data_dict["session_id"])
            ).first()
            if existing is not None:
                return

            now = datetime.now(UTC)
            record = AuthSession(
                session_id=as_str(session_data_dict["session_id"], field="session_id"),
                token_family_id=as_str(session_data_dict["token_family_id"], field="token_family_id"),
                user_id=as_int(session_data_dict["user_id"], field="user_id"),
                refresh_token_hash=as_str(session_data_dict["refresh_token_hash"], field="refresh_token_hash"),
                created_at=now,
                last_seen_at=now,
                expires_at=now + timedelta(seconds=REFRESH_SESSION_TTL),
                ip_address=_optional_str(session_data_dict.get("ip_address"), field="ip_address"),
                user_agent=_optional_str(session_data_dict.get("user_agent"), field="user_agent"),
            )
            db.add(record)
            db.commit()
    except Exception:
        logger.warning("Audit create failed for session %s", session_data_dict.get("session_id"))
        raise


def audit_revoke_sync(session_id: str) -> None:
    """Mark a session as revoked using its own short-lived DB session."""
    try:
        from src.infra.db.engine import get_bg_engine

        engine = get_bg_engine()
        with Session(engine) as db:
            record = db.exec(select(AuthSession).where(AuthSession.session_id == session_id)).first()
            if record and record.revoked_at is None:
                record.revoked_at = datetime.now(UTC)
                db.add(record)
                db.commit()
    except Exception:
        logger.warning("Audit revoke failed for session %s", session_id)
        raise


def audit_rotate_sync(old_session_id: str, new_session_id: str, new_session_dict: JsonObject) -> None:
    """Mark old session as rotated and create new session record, in one DB session."""
    try:
        from src.infra.db.engine import get_bg_engine

        engine = get_bg_engine()
        with Session(engine) as db:
            now = datetime.now(UTC)
            # Mark old session as rotated
            old_record = db.exec(select(AuthSession).where(AuthSession.session_id == old_session_id)).first()
            if old_record is not None:
                old_record.revoked_at = now
                old_record.rotated_at = now
                old_record.replaced_by_session_id = new_session_id
                db.add(old_record)

            new_record = db.exec(select(AuthSession).where(AuthSession.session_id == new_session_id)).first()
            if new_record is None:
                new_record = AuthSession(
                    session_id=as_str(new_session_dict["session_id"], field="session_id"),
                    token_family_id=as_str(new_session_dict["token_family_id"], field="token_family_id"),
                    user_id=as_int(new_session_dict["user_id"], field="user_id"),
                    refresh_token_hash=as_str(new_session_dict["refresh_token_hash"], field="refresh_token_hash"),
                    created_at=now,
                    last_seen_at=now,
                    expires_at=now + timedelta(seconds=REFRESH_SESSION_TTL),
                    ip_address=_optional_str(new_session_dict.get("ip_address"), field="ip_address"),
                    user_agent=_optional_str(new_session_dict.get("user_agent"), field="user_agent"),
                )
                db.add(new_record)
            db.commit()
    except Exception:
        logger.exception(
            "Audit rotate failed for sessions %s -> %s",
            old_session_id,
            new_session_id,
        )
        raise


async def _fire_audit_create(data: SessionData) -> None:
    """Enqueue a non-blocking audit write for a new session."""
    try:
        from src.worker.tasks.auth_sessions import audit_session_created_task

        await audit_session_created_task.kiq(_session_data_to_dict(data))
    except Exception:
        logger.warning("Audit create enqueue failed for session %s", data.session_id)


async def _fire_audit_revoke(session_id: str) -> None:
    """Enqueue a non-blocking audit write for a revoked session."""
    try:
        from src.worker.tasks.auth_sessions import audit_session_revoked_task

        await audit_session_revoked_task.kiq(session_id)
    except Exception:
        logger.warning("Audit revoke enqueue failed for session %s", session_id)


async def _fire_audit_rotate(old_session_id: str, new_session_id: str, new_data: SessionData) -> None:
    """Enqueue a non-blocking audit write for a rotated session."""
    try:
        from src.worker.tasks.auth_sessions import audit_session_rotated_task

        await audit_session_rotated_task.kiq(
            old_session_id,
            new_session_id,
            _session_data_to_dict(new_data),
        )
    except Exception:
        logger.warning(
            "Audit rotate enqueue failed for sessions %s -> %s",
            old_session_id,
            new_session_id,
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
    user_id = require_persisted_id(user.id, model_name="User")
    active_ids = await _get_active_session_ids(user_id)
    if len(active_ids) >= MAX_SESSIONS_PER_USER:
        # Evict oldest sessions until we're under the limit
        sessions_to_evict = active_ids[: len(active_ids) - MAX_SESSIONS_PER_USER + 1]
        for oldest_sid in sessions_to_evict:
            await _delete_session_from_redis(oldest_sid, user_id)
            await _fire_audit_revoke(oldest_sid)

    now = _now_ts()
    session_id = _generate_session_id()
    refresh_token = _generate_refresh_token(session_id)
    data = SessionData(
        session_id=session_id,
        token_family_id=token_family_id or _generate_family_id(),
        user_id=user_id,
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
        logger.exception("Redis unavailable - cannot persist auth session")
        raise DependencyAppError(
            code="AUTH_SESSION_STORE_UNAVAILABLE",
            message="Сервис аутентификации временно недоступен",
            details={"service": "redis", "operation": "create_auth_session"},
            retry_after=30,
            cause=exc,
        ) from exc
    await _fire_audit_create(data)
    return data, refresh_token


async def get_session_by_id(session_id: str) -> SessionData | None:
    return await _read_session_from_redis(session_id)


async def get_session_owner_id(db_session: Session | None, session_id: str) -> int | None:
    active = await _read_session_from_redis(session_id)
    if active is not None:
        return active.user_id

    if db_session is None:
        return None

    try:
        record = db_session.exec(select(AuthSession).where(AuthSession.session_id == session_id)).first()
        return record.user_id if record else None
    except Exception:
        logger.warning("Failed to resolve owner for session %s", session_id)
        return None


async def inspect_refresh_session(db_session: Session, refresh_token: str) -> RefreshSessionInspection:
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
            await _fire_audit_revoke(data.session_id)
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

    grace = await _read_rotation_grace(session_id)
    if grace is not None and grace.get("refresh_token_hash") == hash_refresh_token(refresh_token):
        return RefreshSessionInspection(
            status="rotated",
            session_id=session_id,
            token_family_id=as_str(grace["token_family_id"], field="token_family_id"),
            user_id=as_int(grace["user_id"], field="user_id"),
        )

    # Session not in Redis — check PostgreSQL for reuse / revocation diagnosis.
    # This is a READ-only path; any resulting audit writes are also fire-and-forget.
    record = db_session.exec(select(AuthSession).where(AuthSession.session_id == session_id)).first()
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
    await _delete_session_from_redis(old_session.session_id, old_session.user_id)
    await _write_session_to_redis(new_data, remaining)
    await _write_rotation_grace(old_session, new_data, rotated_at=now)
    await _fire_audit_rotate(old_session.session_id, new_session_id, new_data)
    return new_data, new_refresh_token


async def revoke_session(session_id: str, user_id: int) -> None:
    """Revoke a single session.  No DB session required — audit is async."""
    await _delete_session_from_redis(session_id, user_id)
    await _fire_audit_revoke(session_id)


async def revoke_token_family(token_family_id: str, user_id: int) -> None:
    """Revoke all sessions belonging to a token family.  Audit is async."""
    active_ids = await _get_active_session_ids(user_id)
    for sid in active_ids:
        data = await _read_session_from_redis(sid)
        if data and data.token_family_id == token_family_id:
            await _delete_session_from_redis(sid, user_id)
            await _fire_audit_revoke(sid)


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
        await _fire_audit_revoke(sid)

    return len(active_ids)


async def get_user_active_sessions(user_id: int) -> list[JsonObject]:
    """Return metadata for all active sessions of a user."""
    active_ids = await _get_active_session_ids(user_id)
    result: list[JsonObject] = []
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
