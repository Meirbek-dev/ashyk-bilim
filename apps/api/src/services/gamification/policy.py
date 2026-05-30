"""Policy repository and TTL cache for gamification config overrides.

Provides:
- get_policy(db) -> (rewards: dict[str,int], daily_limit: int)
- invalidate_policy()

Default cache is in-process with a short TTL. Can be swapped to Redis later.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlmodel import Session, select

from src.core.timezone import now as tz_now
from src.db.gamification import (
    DAILY_XP_LIMIT,
    XP_REWARDS,
    PlatformGamificationConfig,
)

# In-process TTL cache: (rewards, daily_limit, cached_at)
_cache: tuple[dict[str, int], int, datetime] | None = None
_TTL = timedelta(minutes=5)


def invalidate_policy() -> None:
    global _cache
    _cache = None


def get_policy(db: Session) -> tuple[dict[str, int], int]:
    global _cache
    now = tz_now()
    if _cache is not None and now - _cache[2] < _TTL:
        return _cache[0], _cache[1]

    cfg = db.exec(select(PlatformGamificationConfig)).first()

    rewards: dict[str, int] = dict(XP_REWARDS)
    daily_limit: int = DAILY_XP_LIMIT
    if cfg:
        if isinstance(cfg.rewards, dict):
            for k, v in cfg.rewards.items():
                try:
                    iv = int(v)
                except ValueError, TypeError:
                    continue
                # Only accept non-positive overrides for admin_award; for other sources enforce > 0
                if k == "admin_award":
                    if iv >= 0:
                        rewards[k] = iv
                elif iv > 0:
                    rewards[k] = iv
        # IMPORTANT: treat 0 or negative as "unset" to avoid blocking all XP by mistake
        # Only positive values will override the default daily limit
        if cfg.daily_xp_limit is not None:
            try:
                dl = int(cfg.daily_xp_limit)
            except ValueError, TypeError:
                dl = None
            if dl is not None and dl > 0:
                daily_limit = dl

    _cache = (rewards, daily_limit, now)
    return rewards, daily_limit

