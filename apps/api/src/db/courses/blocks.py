from datetime import UTC, datetime
from enum import StrEnum

from pydantic import field_validator
from sqlalchemy import JSON, Column, DateTime, ForeignKey, func
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class BlockTypeEnum(StrEnum):
    BLOCK_VIDEO = "BLOCK_VIDEO"
    BLOCK_DOCUMENT_PDF = "BLOCK_DOCUMENT_PDF"
    BLOCK_IMAGE = "BLOCK_IMAGE"
    BLOCK_CUSTOM = "BLOCK_CUSTOM"


class BlockBase(SQLModelStrictBaseModel):
    """Base model for Block with common fields."""

    block_type: BlockTypeEnum = BlockTypeEnum.BLOCK_CUSTOM
    content: dict[str, object] = Field(default_factory=dict, sa_column=Column(JSON))

    @field_validator("block_type", mode="before")
    @classmethod
    def validate_block_type(cls, v: object) -> BlockTypeEnum:
        if isinstance(v, str):
            return BlockTypeEnum(v)
        msg = f"Expected str or BlockTypeEnum, got {type(v).__name__}"
        raise TypeError(msg)


class Block(BlockBase, table=True):
    """Database table model for Block."""

    id: int | None = Field(default=None, primary_key=True)
    course_id: int = Field(sa_column=Column("course_id", ForeignKey("course.id", ondelete="CASCADE")))
    chapter_id: int | None = Field(
        default=None,
        sa_column=Column("chapter_id", ForeignKey("chapter.id", ondelete="CASCADE")),
    )
    activity_id: int = Field(sa_column=Column("activity_id", ForeignKey("activity.id", ondelete="CASCADE")))
    block_uuid: str
    creation_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    update_date: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    )


class BlockCreate(BlockBase):
    """Model for creating a new block."""


class BlockRead(BlockBase):
    """Model for reading a block with all related data."""

    id: int
    course_id: int
    chapter_id: int | None
    activity_id: int
    block_uuid: str
    creation_date: datetime
    update_date: datetime
