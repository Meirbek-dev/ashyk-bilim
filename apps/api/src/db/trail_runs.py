from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import ConfigDict, field_validator
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, func
from sqlmodel import Field

from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel
from src.db.trail_steps import TrailStepRead


class TrailRunEnum(StrEnum):
    RUN_TYPE_COURSE = "RUN_TYPE_COURSE"


class StatusEnum(StrEnum):
    STATUS_IN_PROGRESS = "STATUS_IN_PROGRESS"
    STATUS_COMPLETED = "STATUS_COMPLETED"
    STATUS_PAUSED = "STATUS_PAUSED"
    STATUS_CANCELLED = "STATUS_CANCELLED"


class TrailRun(SQLModelStrictBaseModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    status: StatusEnum = StatusEnum.STATUS_IN_PROGRESS
    # foreign keys
    trail_id: int = Field(sa_column=Column(Integer, ForeignKey("trail.id", ondelete="CASCADE")))
    course_id: int = Field(sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE")))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE")))
    # timestamps
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: object) -> object:
        if isinstance(v, str):
            return StatusEnum(v)
        return v

    update_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class TrailRunCreate(SQLModelStrictBaseModel):
    data: dict[str, Any] = Field(default_factory=dict)
    status: StatusEnum = StatusEnum.STATUS_IN_PROGRESS
    # foreign keys
    trail_id: int
    course_id: int
    user_id: int

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: object) -> object:
        if isinstance(v, str):
            return StatusEnum(v)
        return v


# trick because Lists are not supported in SQLModel (runs: list[TrailStep] )
class TrailRunRead(PydanticStrictBaseModel):
    id: int | None = Field(default=None, primary_key=True)
    data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    status: StatusEnum = StatusEnum.STATUS_IN_PROGRESS
    # foreign keys
    trail_id: int = Field(default=None, foreign_key="trail.id")
    course_id: int = Field(default=None, foreign_key="course.id")
    user_id: int = Field(default=None, foreign_key="user.id")
    # course object
    course: dict[str, Any] | None = None
    # timestamps
    creation_date: datetime | None = None
    update_date: datetime | None = None

    # number of activities in course
    course_total_steps: int
    steps: list[TrailStepRead]
    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v: object) -> object:
        if isinstance(v, str):
            return StatusEnum(v)
        return v
