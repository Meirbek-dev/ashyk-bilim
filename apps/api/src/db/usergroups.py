from sqlalchemy import BigInteger, Column, ForeignKey
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class UserGroupBase(SQLModelStrictBaseModel):
    name: str
    description: str


class UserGroup(UserGroupBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    usergroup_uuid: str = ""
    creation_date: str = ""
    update_date: str = ""
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
    creation_date: str
    update_date: str


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
