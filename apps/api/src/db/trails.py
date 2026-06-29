from datetime import UTC, datetime

from pydantic import ConfigDict, Field as PydanticField
from sqlalchemy import Column, DateTime, ForeignKey, Integer, func
from sqlmodel import Field

from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel
from src.db.trail_runs import TrailRunRead


class TrailBase(SQLModelStrictBaseModel):
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE")))


class Trail(TrailBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE")))
    trail_uuid: str = ""
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class TrailCreate(TrailBase):
    pass


class TrailRead(PydanticStrictBaseModel):
    id: int | None = PydanticField(default=None)
    trail_uuid: str | None = None
    user_id: int
    creation_date: datetime | None = None
    update_date: datetime | None = None
    runs: list[TrailRunRead]

    model_config = ConfigDict(from_attributes=True)
