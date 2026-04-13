"""
Gamification Router

- GET /        → Dashboard
- POST /xp     → Award XP
- POST /streaks/{streak_type} → Update streak
- PATCH /preferences → Update preferences
- GET /leaderboard   → Leaderboard
- GET /rank          → Current user rank
"""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlmodel import Session

from src.db.gamification import (
    DashboardRead,
    GamificationProfile,
    LeaderboardRead,
    ProfileRead,
    StreakUpdateRead,
    TransactionRead,
    XPAwardRequest,
    XPAwardResponse,
    XPSource,
    XPTransaction,
)
from src.db.gamification import (
    StreakType as DBStreakType,
)
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user
from src.security.rbac import PermissionCheckerDep
from src.services.gamification import service
from src.services.gamification.service import (
    DailyLimitExceededError,
    GamificationError,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class UserRankRead(PydanticStrictBaseModel):
    user_id: int
    rank: int | None = None


def _profile_to_read(p: GamificationProfile) -> ProfileRead:
    return ProfileRead(
        user_id=p.user_id,
        total_xp=p.total_xp,
        level=p.level,
        xp_in_current_level=p.xp_in_current_level,
        xp_to_next_level=p.xp_to_next_level,
        level_progress_percent=p.level_progress_percent,
        login_streak=p.login_streak,
        longest_login_streak=p.longest_login_streak,
        learning_streak=p.learning_streak,
        longest_learning_streak=p.longest_learning_streak,
        last_xp_award_date=p.last_xp_award_date,
        last_login_date=p.last_login_date,
        last_learning_date=p.last_learning_date,
        daily_xp_earned=p.daily_xp_earned,
        total_activities_completed=p.total_activities_completed,
        total_courses_completed=p.total_courses_completed,
        preferences=p.preferences or {},
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _transaction_to_read(tx: XPTransaction) -> TransactionRead:
    return TransactionRead(
        id=tx.id,
        user_id=tx.user_id,
        amount=tx.amount,
        source=tx.source,
        source_id=tx.source_id,
        triggered_level_up=tx.triggered_level_up,
        previous_level=tx.previous_level,
        created_at=tx.created_at,
    )


@router.get("/", response_model=DashboardRead)
async def get_unified_dashboard(
    user: Annotated[PublicUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> DashboardRead:
    """Unified endpoint: Get complete gamification dashboard, profile, leaderboard, and config"""
    try:
        data = service.get_dashboard_data(db, user.id, include_leaderboard=True)
        profile = _profile_to_read(data["profile"])
        recent_txs = [
            TransactionRead(
                id=tx.id,
                user_id=tx.user_id,
                amount=tx.amount,
                source=tx.source,
                source_id=tx.source_id,
                triggered_level_up=tx.triggered_level_up,
                previous_level=tx.previous_level,
                created_at=tx.created_at,
            )
            for tx in data["recent_transactions"]
        ]
        leaderboard = data.get("leaderboard")
        return DashboardRead(
            profile=profile,
            recent_transactions=recent_txs,
            user_rank=data.get("user_rank"),
            leaderboard=leaderboard,
        )

    except Exception as e:
        logger.exception("Dashboard error for user %s: %s", user.id, e)
        raise HTTPException(status_code=500, detail="Failed to get dashboard")


@router.post("/xp", response_model=XPAwardResponse)
async def award_xp(
    payload: XPAwardRequest,
    user: Annotated[PublicUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
    checker: PermissionCheckerDep,
):
    """Award XP with strong typing and idempotency."""
    logger.info(f"Award XP request: user={user.id} payload={payload}")
    try:
        if payload.custom_amount is not None:
            if payload.source != XPSource.ADMIN_AWARD:
                raise HTTPException(
                    status_code=400,
                    detail="custom_amount allowed only with ADMIN_AWARD source",
                )
            checker.require(user.id, "platform:manage")

        try:
            normalized_source = (
                payload.source.value
                if isinstance(payload.source, XPSource)
                else XPSource(str(payload.source)).value
            )
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid XP source")

        profile, transaction, level_up, is_new = service.award_xp(
            db=db,
            user_id=user.id,
            source=normalized_source,
            amount=payload.custom_amount,
            source_id=payload.source_id,
            idempotency_key=payload.idempotency_key,
        )
        return XPAwardResponse(
            transaction=_transaction_to_read(transaction),
            profile=_profile_to_read(profile),
            level_up_occurred=level_up,
            previous_level=transaction.previous_level,
            is_new_transaction=is_new,
        )
    except DailyLimitExceededError as e:
        logger.warning(f"Daily limit exceeded for user {user.id}: {e}")
        raise HTTPException(status_code=429, detail=str(e))
    except GamificationError as e:
        logger.warning(f"Gamification error for user {user.id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Award XP error for user %s: %s", user.id, e)
        raise HTTPException(status_code=500, detail="Failed to award XP")


@router.post("/streaks/{streak_type}", response_model=StreakUpdateRead)
async def update_streak(
    streak_type: DBStreakType,
    user: Annotated[PublicUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
):
    try:
        profile = service.update_streak(db, user.id, streak_type.value)
        if streak_type == DBStreakType.LOGIN:
            return StreakUpdateRead(
                streak_type=streak_type.value,
                current_count=profile.login_streak,
                longest_count=profile.longest_login_streak,
                is_new_record=profile.login_streak == profile.longest_login_streak,
            )
        return StreakUpdateRead(
            streak_type=streak_type.value,
            current_count=profile.learning_streak,
            longest_count=profile.longest_learning_streak,
            is_new_record=profile.learning_streak == profile.longest_learning_streak,
        )
    except GamificationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Update streak error for user %s: %s", user.id, e)
        raise HTTPException(status_code=500, detail="Failed to update streak")


@router.patch("/preferences", response_model=ProfileRead)
async def update_preferences(
    data: Annotated[dict[str, Any], Body()] = ...,
    user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db: Annotated[Session, Depends(get_db_session)] = None,
):
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Invalid preferences body")
    try:
        profile = service.update_preferences(db, user.id, data)
        return _profile_to_read(profile)
    except Exception as e:
        logger.exception("Update preferences error for user %s: %s", user.id, e)
        raise HTTPException(status_code=500, detail="Failed to update preferences")


@router.get("/leaderboard", response_model=LeaderboardRead)
async def get_leaderboard(
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    offset: Annotated[int, Query(ge=0)] = 0,
    user: Annotated[PublicUser, Depends(get_current_user)] = None,
    db: Annotated[Session, Depends(get_db_session)] = None,
):
    try:
        return service.get_leaderboard_read(db, limit=limit, offset=offset)
    except Exception as e:
        logger.exception("Leaderboard error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get leaderboard")


@router.get("/rank", response_model=UserRankRead)
async def get_user_rank(
    user: Annotated[PublicUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> UserRankRead:
    """Return the current user's rank within the platform."""
    try:
        rank = service.get_user_rank(db, user.id)
        if rank is None:
            service.get_profile(db, user.id)
            rank = service.get_user_rank(db, user.id)
        return UserRankRead(user_id=user.id, rank=rank)
    except Exception as e:
        logger.exception("User rank error for user %s: %s", user.id, e)
        raise HTTPException(status_code=500, detail="Failed to get user rank")
