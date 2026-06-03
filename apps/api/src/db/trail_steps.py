from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import Field as PydanticField, field_validator
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, func
from sqlmodel import Field

from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel


class TrailStepTypeEnum(StrEnum):
    STEP_TYPE_READABLE_ACTIVITY = "STEP_TYPE_READABLE_ACTIVITY"
    STEP_TYPE_CUSTOM_ACTIVITY = "STEP_TYPE_CUSTOM_ACTIVITY"


class TrailStep(SQLModelStrictBaseModel, table=True):
    """TrailStep database model representing a step in a learning trail.

    This model tracks completion status, verification, grading, and metadata
    for individual steps within a learning trail.

    Personal trail UX table: do not use TrailStep.complete for required course
    progress, certificate eligibility, teacher analytics, or gradebook state.
    Those reads must come from ActivityProgress/CourseProgress.
    """

    id: int | None = Field(default=None, primary_key=True)
    complete: bool = Field()
    teacher_verified: bool = Field()
    # Allow a default value for `grade` to avoid Pydantic errors when legacy rows
    # contain empty strings. Database column remains Integer.
    grade: int = Field(default=0, sa_column=Column(Integer))
    data: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
    )

    # Foreign key relationships
    trailrun_id: int = Field(sa_column=Column(Integer, ForeignKey("trailrun.id", ondelete="CASCADE")))
    trail_id: int = Field(sa_column=Column(Integer, ForeignKey("trail.id", ondelete="CASCADE")))
    activity_id: int = Field(sa_column=Column(Integer, ForeignKey("activity.id", ondelete="CASCADE")))
    course_id: int = Field(sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE")))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE")))

    # Timestamps
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class TrailStepRead(PydanticStrictBaseModel):
    id: int | None = PydanticField(default=None)
    complete: bool
    teacher_verified: bool
    # Make grade tolerant: accept strings/empty values and coerce to int (default 0)
    grade: int = PydanticField(default=0)
    data: dict[str, Any] = PydanticField(default_factory=dict)
    trailrun_id: int
    trail_id: int
    activity_id: int
    course_id: int
    user_id: int
    creation_date: datetime | None = None
    update_date: datetime | None = None
    activity: dict[str, Any] | None = None

    @field_validator("grade", mode="before")
    @classmethod
    def _validate_grade(cls, v: Any) -> int:
        # Normalize empty strings and non-int strings to 0, preserve ints
        if v is None:
            return 0
        if isinstance(v, str):
            v = v.strip()
            if v == "":
                return 0
            try:
                return int(v)
            except ValueError:
                return 0
        try:
            return int(v)
        except TypeError, ValueError:
            return 0
