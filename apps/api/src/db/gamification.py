"""Gamification Models."""

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import field_validator
from sqlalchemy import JSON, CheckConstraint, Column, Index, UniqueConstraint
from sqlmodel import Field, SQLModel

from src.core.timezone import now as tz_now
from src.db.strict_base_model import JsonObject, PydanticStrictBaseModel

XP_REWARDS = {
    "activity_completion": 25,
    "course_completion": 200,
    "login_bonus": 10,
    "quiz_completion": 30,
    "exam_completion": 50,
    "streak_bonus": 50,
    "admin_award": 0,  # Custom amount required
    # Code challenge rewards
    "code_challenge_completion": 50,  # Base completion XP
    "code_challenge_perfect": 100,  # All tests passed
    "code_challenge_first_solve": 25,  # First time solving
}

DAILY_XP_LIMIT = 500
MAX_LEVEL = 100


class XPSource(StrEnum):
    """XP source types."""

    ACTIVITY_COMPLETION = "activity_completion"
    COURSE_COMPLETION = "course_completion"
    LOGIN_BONUS = "login_bonus"
    QUIZ_COMPLETION = "quiz_completion"
    EXAM_COMPLETION = "exam_completion"
    STREAK_BONUS = "streak_bonus"
    ADMIN_AWARD = "admin_award"
    # Code challenge sources
    CODE_CHALLENGE_COMPLETION = "code_challenge_completion"
    CODE_CHALLENGE_PERFECT = "code_challenge_perfect"
    CODE_CHALLENGE_FIRST_SOLVE = "code_challenge_first_solve"


class StreakType(StrEnum):
    """Streak types."""

    LOGIN = "login"
    LEARNING = "learning"


def calculate_level(total_xp: int) -> int:
    """Уровень рассчитывается на основе общего количества XP с использованием квадратичной кривой.

    Формула кривой: XP = 50 * (level - 1)^2 + 50 * (level - 1)
    SolРешение уравнения для определения уровня дает: level = floor((-1 + sqrt(1 + 0.08 * XP)) / 2) + 1
    """
    import math

    if total_xp <= 0:
        return 1
    try:
        level = int((-1.0 + math.sqrt(1.0 + 0.08 * total_xp)) / 2.0) + 1
    except Exception:
        level = 1
    return min(level, MAX_LEVEL)


def get_xp_for_level(level: int) -> int:
    """Calculate total XP required to reach a given level using quadratic curve."""
    if level <= 1:
        return 0
    return 50 * (level - 1) ** 2 + 50 * (level - 1)


class GamificationProfile(SQLModel, table=True):
    """Single gamification profile model with consistent naming."""

    __tablename__ = "gamification_profiles"  # pyright: ignore[reportAssignmentType]

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    total_xp: int = Field(default=0, ge=0)
    level: int = Field(default=1, ge=1, le=MAX_LEVEL)
    daily_xp_earned: int = Field(default=0, ge=0)

    # Streaks with consistent naming
    login_streak: int = Field(default=0, ge=0)
    learning_streak: int = Field(default=0, ge=0)
    longest_login_streak: int = Field(default=0, ge=0)
    longest_learning_streak: int = Field(default=0, ge=0)

    # Activity counters
    total_activities_completed: int = Field(default=0, ge=0)
    total_courses_completed: int = Field(default=0, ge=0)

    # Timestamps
    last_xp_award_date: datetime | None = Field(default=None)
    last_login_date: datetime | None = Field(default=None)
    last_learning_date: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=tz_now)
    updated_at: datetime = Field(default_factory=tz_now)

    # Preferences
    preferences: JsonObject = Field(default_factory=dict, sa_column=Column(JSON))

    # Database constraints
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_gamification_profile_user"),
        CheckConstraint("total_xp >= 0", name="ck_total_xp_positive"),
        CheckConstraint("level >= 1 AND level <= 100", name="ck_level_range"),
        Index("idx_profile_total_xp", "total_xp"),
    )

    # Computed properties
    @property
    def xp_to_next_level(self) -> int:
        """XP needed to reach next level."""
        if self.level >= MAX_LEVEL:
            return 0
        return get_xp_for_level(self.level + 1) - self.total_xp

    @property
    def level_progress_percent(self) -> float:
        """Progress through current level (0.0 to 100.0)."""
        if self.level >= MAX_LEVEL:
            return 100.0
        current_level_xp = get_xp_for_level(self.level)
        next_level_xp = get_xp_for_level(self.level + 1)
        if next_level_xp == current_level_xp:
            return 100.0
        progress = (self.total_xp - current_level_xp) / (next_level_xp - current_level_xp)
        return round(progress * 100.0, 1)

    @property
    def xp_in_current_level(self) -> int:
        """XP earned in current level."""
        return self.total_xp - get_xp_for_level(self.level)


class XPTransaction(SQLModel, table=True):
    """XP transaction audit trail."""

    __tablename__ = "xp_transactions"  # pyright: ignore[reportAssignmentType]

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)

    # Transaction data
    amount: int = Field(gt=0)
    source: XPSource = Field(index=True)
    source_id: str | None = Field(default=None)
    reason: str | None = Field(default=None)

    # Level tracking
    previous_level: int = Field(ge=1)
    triggered_level_up: bool = Field(default=False)

    # Timestamps
    created_at: datetime = Field(default_factory=tz_now, index=True)

    # Idempotency
    idempotency_key: str | None = Field(default=None, unique=True)

    __table_args__ = (
        Index("idx_transaction_user", "user_id"),
        Index("idx_transaction_source", "source", "source_id"),
        # Prevent duplicate awards for the same (user, source, source_id). NULL source_id allowed multiple times.
        UniqueConstraint(
            "user_id",
            "source",
            "source_id",
            name="uq_xp_tx_user_source_once",
        ),
    )


class PlatformGamificationConfig(SQLModel, table=True):
    """Gamification policy overrides.

    Safe optional overrides with sane defaults applied in service if fields are null.
    """

    __tablename__ = "org_gamification_config"  # pyright: ignore[reportAssignmentType]

    id: int | None = Field(default=None, primary_key=True)
    # Optional overrides
    daily_xp_limit: int | None = Field(default=None, ge=0)
    rewards: JsonObject | None = Field(default=None, sa_column=Column(JSON))
    updated_at: datetime = Field(default_factory=tz_now)


# ---------------------------------
# Pydantic API schemas colocated to avoid duplication
# ---------------------------------


class ProfileRead(PydanticStrictBaseModel):
    """User gamification profile for API responses."""

    # NOTE: Aren't there too many fields? Maybe clean up normalize this model or something?
    user_id: int
    total_xp: int
    level: int
    xp_in_current_level: int
    xp_to_next_level: int
    level_progress_percent: float
    login_streak: int
    longest_login_streak: int
    learning_streak: int
    longest_learning_streak: int
    last_xp_award_date: datetime | None = None
    last_login_date: datetime | None = None
    last_learning_date: datetime | None = None
    daily_xp_earned: int
    total_activities_completed: int
    total_courses_completed: int
    preferences: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class TransactionRead(PydanticStrictBaseModel):
    """XP transaction for API responses."""

    id: int
    user_id: int
    amount: int
    source: XPSource
    source_id: str | None = None
    triggered_level_up: bool
    previous_level: int
    created_at: datetime

    @field_validator("source", mode="before")
    @classmethod
    def validate_source(cls, value: object) -> object:
        if isinstance(value, str):
            return XPSource(value)
        return value


class LeaderboardEntryRead(PydanticStrictBaseModel):
    """Single leaderboard entry.

    Includes user profile data for rich leaderboard displays.
    """

    rank: int
    user_id: int
    total_xp: int
    level: int
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    avatar_url: str | None = None
    rank_change: int | None = None


class LeaderboardRead(PydanticStrictBaseModel):
    """Leaderboard."""

    entries: list[LeaderboardEntryRead]
    total_participants: int


class DashboardRead(PydanticStrictBaseModel):
    """Dashboard data combining profile, transactions, and leaderboard snapshot."""

    profile: ProfileRead
    recent_transactions: list[TransactionRead]
    user_rank: int | None = None
    leaderboard: LeaderboardRead | None = None


class StreakUpdateRead(PydanticStrictBaseModel):
    """Streak update response."""

    streak_type: str
    current_count: int
    longest_count: int
    is_new_record: bool


class XPAwardRequest(PydanticStrictBaseModel):
    """Request to award XP."""

    # Accept both enum and raw string to be robust under strict validation
    source: XPSource | str
    source_id: str | None = None
    custom_amount: int | None = None
    idempotency_key: str | None = None


class XPAwardResponse(PydanticStrictBaseModel):
    """Response from XP award operation."""

    transaction: TransactionRead
    profile: ProfileRead
    level_up_occurred: bool
    previous_level: int
    is_new_transaction: bool
