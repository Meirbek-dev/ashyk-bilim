from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, func
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class UserGroupUser(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    usergroup_id: int = Field(sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="CASCADE")))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE")))
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )
