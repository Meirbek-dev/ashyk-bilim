from datetime import UTC, datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, func
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class UserGroupBase(SQLModelStrictBaseModel):
    name: str
    description: str


class UserGroup(UserGroupBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    usergroup_uuid: str = ""
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )
    creator_id: int | None = Field(
        default=None,
        sa_column=Column(BigInteger, ForeignKey("user.id", ondelete="SET NULL")),
    )


class UserGroupCreate(UserGroupBase):
    pass


class UserGroupUpdate(SQLModelStrictBaseModel):
    name: str | None = None
    description: str | None = None


class UserGroupRead(UserGroupBase):
    id: int
    creator_id: int | None = None
    usergroup_uuid: str
    creation_date: datetime
    update_date: datetime


class UserGroupReadWithPermissions(UserGroupRead):
    """UserGroup response with permission metadata."""

    # Permission flags
    can_update: bool | None = False
    can_delete: bool | None = False
    can_manage: bool | None = False
    is_owner: bool | None = False
    is_member: bool | None = False

    # Available actions array
    available_actions: list[str] | None = Field(default_factory=list)
