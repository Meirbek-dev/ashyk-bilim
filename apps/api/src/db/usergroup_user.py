from sqlalchemy import Column, ForeignKey, Integer
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class UserGroupUser(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    usergroup_id: int = Field(sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="CASCADE")))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE")))
    creation_date: str = ""
    update_date: str = ""
