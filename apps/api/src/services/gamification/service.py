"""
Gamification Service - cohesive business logic layer

Responsibilities:
- Idempotent, atomic XP awards with daily caps and level computation
- Streak updates and counters
- Leaderboard, dashboard aggregation, rank
- Preference updates
- Emits domain events via EventPublisher

Notes:
- Policy (rewards/daily limit) resolution is handled via PolicyRepo with a TTL cache
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import Session, and_, select
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from src.core.timezone import now as tz_now
from src.db.gamification import (
    GamificationProfile,
    LeaderboardRead,
    StreakType,
    XPSource,
    XPTransaction,
    calculate_level,
)
from src.services.gamification.policy import get_policy

logger = logging.getLogger(__name__)


class GamificationError(Exception):
    """Base gamification error"""


class DailyLimitExceededError(GamificationError):
    """Daily XP limit exceeded"""


def _find_existing_transaction(
    db: Session,
    user_id: int,
    *,
    source: str,
    source_id: str | None,
    idempotency_key: str | None,
) -> XPTransaction | None:
    if idempotency_key:
        stmt = select(XPTransaction).where(
            and_(
                XPTransaction.user_id == user_id,
                XPTransaction.idempotency_key == idempotency_key,
            )
        )
        existing_tx = db.exec(stmt).first()
        if existing_tx is not None:
            return existing_tx

    if source_id is None:
        return None

    try:
        xp_source = XPSource(source)
    except ValueError:
        return None

    stmt = select(XPTransaction).where(
        and_(
            XPTransaction.user_id == user_id,
            XPTransaction.source == xp_source,
            XPTransaction.source_id == source_id,
        )
    )
    return db.exec(stmt).first()


def _exceeds_daily_limit(
    profile: GamificationProfile, amount: int, daily_limit: int
) -> bool:
    # Non-positive limit means "unlimited" (ignore). This also safeguards against
    # transient misconfiguration cached in policy.
    if daily_limit <= 0:
        return False
    today = tz_now().date()
    if profile.last_xp_award_date and profile.last_xp_award_date.date() == today:
        return (profile.daily_xp_earned + amount) > daily_limit
    return amount > daily_limit


def _update_daily_tracking_with_policy(
    profile: GamificationProfile, amount: int, now: datetime
) -> None:
    today = now.date()
    if profile.last_xp_award_date and profile.last_xp_award_date.date() == today:
        profile.daily_xp_earned += amount
    else:
        profile.daily_xp_earned = amount
    profile.last_xp_award_date = now


def _fetch_count(db: Session, stmt: SelectOfScalar[int]) -> int:
    """Reliable count(*) helper that works across SQL backends."""
    try:
        value = db.scalar(stmt)
    except (SQLAlchemyError, TypeError, AttributeError) as exc:
        logger.warning("Primary count query failed; attempting fallback", exc_info=exc)
        try:
            result = db.exec(stmt)
        except SQLAlchemyError as fallback_exc:
            logger.warning("Fallback count query failed", exc_info=fallback_exc)
            return 0
        first = None
        try:
            first = result.one_or_none()
        except AttributeError, TypeError:
            try:
                first = result.first()
            except AttributeError, TypeError:
                first = None
        if first is None:
            return 0
        value = first[0] if isinstance(first, (tuple, list)) else first
    if value is None:
        return 0
    try:
        return int(value)
    except TypeError, ValueError:
        return 0


def _count_users_with_more_xp(db: Session, xp: int) -> int:
    stmt = (
        select(func.count())
        .select_from(GamificationProfile)
        .where(GamificationProfile.total_xp > xp)
    )
    return _fetch_count(db, stmt)


def _count_profiles(db: Session) -> int:
    stmt = select(func.count()).select_from(GamificationProfile)
    return _fetch_count(db, stmt)


def get_profile(db: Session, user_id: int) -> GamificationProfile:
    stmt = select(GamificationProfile).where(GamificationProfile.user_id == user_id)
    # Removed with_for_update() lock to prevent hanging on new user creation
    # The unique constraint on user_id handles concurrency
    profile = db.exec(stmt).first()
    if not profile:
        profile = GamificationProfile(user_id=user_id)
        db.add(profile)
        try:
            db.commit()
            db.refresh(profile)
        except IntegrityError:
            # Handle race condition: another request created the profile
            db.rollback()
            profile = db.exec(stmt).first()
            if not profile:
                # If still not found, re-raise the error
                raise
    return profile


def award_xp(
    db: Session,
    user_id: int,
    source: str,
    amount: int | None = None,
    source_id: str | None = None,
    idempotency_key: str | None = None,
):
    """Award XP atomically and idempotently.

    Returns (profile, transaction, level_up_occurred, is_new_transaction).
    """
    now = tz_now()
    try:
        try:
            xp_source = XPSource(source)
        except ValueError:
            msg = f"Invalid XP source: {source}"
            raise GamificationError(msg)

        rewards, daily_limit = get_policy(db)
        resolved_amount = (
            amount if amount is not None else rewards.get(xp_source.value, 0)
        )
        if resolved_amount <= 0:
            msg = f"Invalid XP amount: {resolved_amount}"
            raise GamificationError(msg)

        pre_profile = get_profile(db, user_id)
        existing_tx = _find_existing_transaction(
            db,
            user_id,
            source=source,
            source_id=source_id,
            idempotency_key=idempotency_key,
        )
        if existing_tx is not None:
            return pre_profile, existing_tx, existing_tx.triggered_level_up, False

        old_level = pre_profile.level
        tx = XPTransaction(
            user_id=user_id,
            amount=resolved_amount,
            source=xp_source,
            source_id=source_id,
            previous_level=old_level,
            triggered_level_up=False,
            idempotency_key=idempotency_key,
        )
        db.add(tx)
        db.flush()

        profile = pre_profile
        if xp_source != XPSource.ADMIN_AWARD and _exceeds_daily_limit(
            profile, resolved_amount, daily_limit
        ):
            msg = "Daily XP limit exceeded"
            raise DailyLimitExceededError(msg)

        profile.total_xp += resolved_amount
        profile.level = calculate_level(profile.total_xp)
        profile.updated_at = now
        _update_daily_tracking_with_policy(profile, resolved_amount, now)

        tx.triggered_level_up = profile.level > old_level

        db.commit()
        db.refresh(profile)
        return profile, tx, tx.triggered_level_up, True
    except IntegrityError as e:
        db.rollback()
        if any(
            s in str(e).lower()
            for s in ["uq_xp_tx_user_source_once", "idempotency_key", "unique"]
        ):
            profile = get_profile(db, user_id)
            existing_tx = _find_existing_transaction(
                db,
                user_id,
                source=source,
                source_id=source_id,
                idempotency_key=idempotency_key,
            )
            if existing_tx is None:
                existing_tx = db.exec(
                    select(XPTransaction)
                    .where(XPTransaction.user_id == user_id)
                    .order_by(XPTransaction.created_at.desc())
                ).first()
            if existing_tx is None:
                msg = "Transaction not found after idempotent insert"
                raise GamificationError(msg)
            return profile, existing_tx, existing_tx.triggered_level_up, False
        msg = f"Database error: {e}"
        raise GamificationError(msg)
    except SQLAlchemyError, ValueError, TypeError:
        db.rollback()
        raise


def update_streak(db: Session, user_id: int, streak_type: str) -> GamificationProfile:
    profile = get_profile(db, user_id)
    now = tz_now()
    today = now.date()
    try:
        s_type = StreakType(streak_type)
    except ValueError:
        msg = f"Invalid streak type: {streak_type}"
        raise GamificationError(msg)

    if s_type == StreakType.LOGIN:
        last_date = profile.last_login_date
        current_streak = profile.login_streak
        profile.last_login_date = now
    else:
        last_date = profile.last_learning_date
        current_streak = profile.learning_streak
        profile.last_learning_date = now

    if last_date:
        days_since = (today - last_date.date()).days
        if days_since == 0:
            new_streak = current_streak
        elif days_since == 1:
            new_streak = current_streak + 1
        else:
            new_streak = 1
    else:
        new_streak = 1

    if s_type == StreakType.LOGIN:
        profile.login_streak = new_streak
        profile.longest_login_streak = max(profile.longest_login_streak, new_streak)
    else:
        profile.learning_streak = new_streak
        profile.longest_learning_streak = max(
            profile.longest_learning_streak, new_streak
        )

    profile.updated_at = now
    db.commit()
    db.refresh(profile)
    return profile


def get_leaderboard(
    db: Session, limit: int = 10, offset: int = 0
) -> list[GamificationProfile]:
    stmt = (
        select(GamificationProfile)
        .order_by(GamificationProfile.total_xp.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(db.exec(stmt).all())


def get_recent_transactions(
    db: Session, user_id: int, limit: int = 10
) -> list[XPTransaction]:
    stmt = (
        select(XPTransaction)
        .where(XPTransaction.user_id == user_id)
        .order_by(XPTransaction.created_at.desc())
        .limit(limit)
    )
    return list(db.exec(stmt).all())


def get_dashboard_data(
    db: Session, user_id: int, *, include_leaderboard: bool = False
) -> dict:
    profile = get_profile(db, user_id)
    transactions = get_recent_transactions(db, user_id, limit=10)
    user_xp = profile.total_xp
    higher_count = _count_users_with_more_xp(db, user_xp)
    user_rank = higher_count + 1 if profile else None
    leaderboard: LeaderboardRead | None = None
    if include_leaderboard:
        leaderboard = get_leaderboard_read(db, limit=10, offset=0)

    return {
        "profile": profile,
        "recent_transactions": transactions,
        "leaderboard": leaderboard,
        "user_rank": user_rank,
        "streak_info": {
            "login_streak": profile.login_streak,
            "learning_streak": profile.learning_streak,
            "longest_login_streak": profile.longest_login_streak,
            "longest_learning_streak": profile.longest_learning_streak,
        },
    }


def update_preferences(
    db: Session, user_id: int, updates: dict[str, Any]
) -> GamificationProfile:
    """Merge and persist profile preferences, returning updated profile.

    - Non-dict values in updates are ignored
    - None values remove keys from preferences
    """
    profile = get_profile(db, user_id)
    prefs = dict(profile.preferences or {})
    for k, v in updates.items():
        if v is None:
            prefs.pop(k, None)
        else:
            prefs[k] = v
    profile.preferences = prefs
    profile.updated_at = tz_now()
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def get_leaderboard_read(db: Session, limit: int = 10, offset: int = 0):
    """Return typed LeaderboardRead including total participants and usernames."""
    from src.db.gamification import LeaderboardEntryRead, LeaderboardRead
    from src.db.users import User as DBUser

    profiles = get_leaderboard(db, limit=limit, offset=offset)
    total = _count_profiles(db)

    ids = [p.user_id for p in profiles]
    user_map: dict[int, DBUser] = {}
    if ids:
        try:
            users = db.exec(select(DBUser).where(DBUser.id.in_(ids))).all()
            user_map = {u.id: u for u in users}
        except SQLAlchemyError as exc:
            logger.warning("Failed to load leaderboard user metadata", exc_info=exc)
            user_map = {}

    entries = []
    for i, p in enumerate(profiles):
        user = user_map.get(p.user_id)

        avatar_url = None
        if user and user.avatar_image:
            if user.avatar_image.startswith(("http://", "https://")):
                avatar_url = user.avatar_image
            else:
                avatar_url = (
                    f"content/users/{user.user_uuid}/avatars/{user.avatar_image}"
                )

        entries.append(
            LeaderboardEntryRead(
                rank=offset + i + 1,
                user_id=p.user_id,
                total_xp=p.total_xp,
                level=p.level,
                username=user.username if user else None,
                first_name=user.first_name if user else None,
                last_name=user.last_name if user else None,
                avatar_url=avatar_url,
                rank_change=None,  # TODO: Implement rank change tracking
            )
        )
    return LeaderboardRead(entries=entries, total_participants=total)


def get_user_rank(db: Session, user_id: int) -> int | None:
    profile = get_profile(db, user_id)
    if not profile:
        return None
    higher_count = _count_users_with_more_xp(db, profile.total_xp)
    return higher_count + 1


def on_activity_completed(
    db: Session,
    user_id: int,
    *,
    activity_id: int | None = None,
    source_id: str | None = None,
    idempotency_key: str | None = None,
):
    profile, _tx, _level_up, is_new = award_xp(
        db=db,
        user_id=user_id,
        source=XPSource.ACTIVITY_COMPLETION.value,
        amount=None,
        source_id=source_id
        if source_id is not None
        else (str(activity_id) if activity_id is not None else None),
        idempotency_key=idempotency_key,
    )
    # Only update streaks and counters if this call resulted in a new XP transaction
    if is_new:
        profile = update_streak(db, user_id, StreakType.LEARNING.value)
        profile = get_profile(db, user_id)
        profile.total_activities_completed = (
            profile.total_activities_completed or 0
        ) + 1
        profile.updated_at = tz_now()
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def on_course_completed(
    db: Session,
    user_id: int,
    *,
    course_id: int | None = None,
    source_id: str | None = None,
    idempotency_key: str | None = None,
):
    profile, _tx, _level_up, is_new = award_xp(
        db=db,
        user_id=user_id,
        source=XPSource.COURSE_COMPLETION.value,
        amount=None,
        source_id=source_id
        if source_id is not None
        else (str(course_id) if course_id is not None else None),
        idempotency_key=idempotency_key,
    )
    # Only update streaks and counters if this call resulted in a new XP transaction
    if is_new:
        profile = update_streak(db, user_id, StreakType.LEARNING.value)
        profile = get_profile(db, user_id)
        profile.total_courses_completed = (profile.total_courses_completed or 0) + 1
        profile.updated_at = tz_now()
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile
