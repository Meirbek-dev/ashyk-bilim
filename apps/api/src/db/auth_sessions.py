from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, UniqueConstraint
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class AuthSession(SQLModelStrictBaseModel, table=True):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        UniqueConstraint("session_id", name="uq_auth_sessions_session_id"),
        UniqueConstraint(
            "refresh_token_hash", name="uq_auth_sessions_refresh_token_hash"
        ),
        Index("idx_auth_sessions_user_id", "user_id"),
        Index("idx_auth_sessions_session_id", "session_id"),
        Index("idx_auth_sessions_refresh_token_hash", "refresh_token_hash"),
        Index("idx_auth_sessions_token_family_id", "token_family_id"),
    )

    id: int | None = Field(
        default=None,
        sa_column=Column(Integer, primary_key=True, autoincrement=True),
    )
    session_id: str = Field(index=True)
    token_family_id: str = Field(index=True)
    user_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
        )
    )
    refresh_token_hash: str = Field(index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    rotated_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    revoked_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    last_seen_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    replaced_by_session_id: str | None = Field(default=None)
    ip_address: str | None = Field(default=None)
    user_agent: str | None = Field(default=None)
    device_name: str | None = Field(default=None)
