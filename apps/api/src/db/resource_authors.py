from datetime import UTC, datetime
from enum import StrEnum

from pydantic import field_validator
from sqlalchemy import Column, DateTime, ForeignKey, Integer, func
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class ResourceAuthorshipEnum(StrEnum):
    CREATOR = "CREATOR"
    CONTRIBUTOR = "CONTRIBUTOR"
    MAINTAINER = "MAINTAINER"
    REPORTER = "REPORTER"


class ResourceAuthorshipStatusEnum(StrEnum):
    ACTIVE = "ACTIVE"
    PENDING = "PENDING"
    INACTIVE = "INACTIVE"


class ResourceAuthor(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    resource_uuid: str
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE")))
    authorship: ResourceAuthorshipEnum
    authorship_status: ResourceAuthorshipStatusEnum
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )

    @field_validator("authorship", mode="before")
    @classmethod
    def validate_authorship(cls, v: object) -> object:
        if isinstance(v, str):
            return ResourceAuthorshipEnum(v)
        return v

    @field_validator("authorship_status", mode="before")
    @classmethod
    def validate_authorship_status(cls, v: object) -> object:
        if isinstance(v, str):
            return ResourceAuthorshipStatusEnum(v)
        return v
