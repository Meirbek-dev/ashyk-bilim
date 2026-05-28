from enum import Enum, StrEnum

from pydantic import field_validator
from sqlalchemy import Column, ForeignKey, Integer
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
    creation_date: str = ""
    update_date: str = ""

    @field_validator("authorship", mode="before")
    @classmethod
    def validate_authorship(cls, v):
        if isinstance(v, str):
            return ResourceAuthorshipEnum(v)
        return v

    @field_validator("authorship_status", mode="before")
    @classmethod
    def validate_authorship_status(cls, v):
        if isinstance(v, str):
            return ResourceAuthorshipStatusEnum(v)
        return v
