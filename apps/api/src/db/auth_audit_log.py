from collections.abc import Callable
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import JSON, Text
from sqlmodel import Column, Field, SQLModel

from src.types import JsonObject


class AuthAuditLog(SQLModel, table=True):
    __tablename__: ClassVar[str | Callable[..., str]] = "auth_audit_log"  # type: ignore[explicit-any]

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    user_id: str | None = Field(default=None, index=True)
    event_type: str = Field(sa_column=Column(Text, nullable=False, index=True))
    session_id: str | None = Field(default=None)
    ip_address: str | None = Field(default=None)
    user_agent: str | None = Field(default=None)
    metadata_: JsonObject | None = Field(default=None, sa_column=Column("metadata", JSON))
    severity: str = Field(default="info")
