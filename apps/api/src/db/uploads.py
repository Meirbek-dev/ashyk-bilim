"""Persisted upload lifecycle records."""

from datetime import UTC, datetime, timedelta
from enum import StrEnum

from pydantic import ConfigDict, Field
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlmodel import Field as SQLField

from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel


class UploadStatus(StrEnum):
    CREATED = "CREATED"
    RECEIVING = "RECEIVING"
    FINALIZED = "FINALIZED"
    CANCELLED = "CANCELLED"


class Upload(SQLModelStrictBaseModel, table=True):
    """One user-owned upload before it is referenced by a submission answer."""

    __tablename__ = "upload"
    __table_args__ = (
        Index("ix_upload_upload_id", "upload_id", unique=True),
        Index("ix_upload_user_status", "user_id", "status"),
    )

    id: int | None = SQLField(default=None, primary_key=True)
    upload_id: str
    user_id: int = SQLField(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"))
    )
    filename: str = ""
    content_type: str = ""
    size: int | None = None
    sha256: str | None = None
    key: str | None = None
    status: UploadStatus = SQLField(
        default=UploadStatus.CREATED,
        sa_column=Column("status", String, nullable=False, server_default="CREATED"),
    )
    # Number of Submission rows that reference this upload via answers_json.
    # Incremented on submission save; drives the orphan reaper (nightly cron
    # deletes FINALIZED rows where referenced_count=0 and finalized_at < now-24h).
    referenced_count: int = SQLField(
        default=0,
        sa_column=Column(
            "referenced_count", Integer, nullable=False, server_default="0"
        ),
    )
    expires_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC) + timedelta(hours=24),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = SQLField(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    finalized_at: datetime | None = SQLField(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    referenced_at: datetime | None = SQLField(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )


class UploadCreate(PydanticStrictBaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str = ""
    size: int | None = Field(default=None, ge=0)


class UploadCreateResponse(PydanticStrictBaseModel):
    upload_id: str
    put_url: str
    expires_at: datetime


class UploadFinalize(PydanticStrictBaseModel):
    sha256: str = Field(..., min_length=64, max_length=64)
    content_type: str = ""


class UploadRead(PydanticStrictBaseModel):
    model_config = ConfigDict(from_attributes=True)

    upload_id: str
    filename: str
    content_type: str
    size: int | None = None
    sha256: str | None = None
    key: str | None = None
    status: UploadStatus
    expires_at: datetime
    finalized_at: datetime | None = None
