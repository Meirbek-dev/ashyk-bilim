from sqlalchemy import BigInteger, Column, ForeignKey
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class CollectionBase(SQLModelStrictBaseModel):
    name: str
    public: bool
    description: str | None = ""


class Collection(CollectionBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    creator_id: int | None = Field(
        default=None,
        sa_column=Column(BigInteger, ForeignKey("user.id", ondelete="SET NULL")),
    )
    collection_uuid: str = ""
    creation_date: str = ""
    update_date: str = ""


class CollectionCreate(CollectionBase):
    courses: list[int]


class CollectionUpdate(SQLModelStrictBaseModel):
    courses: list[int] | None = None
    name: str | None = None
    public: bool | None = None
    description: str | None = ""


class CollectionRead(CollectionBase):
    id: int
    creator_id: int | None = None
    courses: list[int]
    collection_uuid: str
    creation_date: str
    update_date: str


class CollectionReadWithPermissions(CollectionRead):
    """Collection response with permission metadata for frontend."""

    can_update: bool
    can_delete: bool
    is_owner: bool
