from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Text
from sqlmodel import Column, Field, SQLModel


class AuthAuditLog(SQLModel, table=True):
    __tablename__ = "auth_audit_log"

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    user_id: str | None = Field(default=None, index=True)
    event_type: str = Field(sa_column=Column(Text, nullable=False, index=True))
    session_id: str | None = Field(default=None)
    ip_address: str | None = Field(default=None)
    user_agent: str | None = Field(default=None)
    metadata_: dict[str, Any] | None = Field(
        default=None, sa_column=Column("metadata", JSON)
    )
    severity: str = Field(default="info")
