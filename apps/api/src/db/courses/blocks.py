from enum import Enum, StrEnum

from pydantic import ConfigDict, field_validator
from sqlalchemy import JSON, Column, ForeignKey
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
    content: dict = Field(default_factory=dict, sa_column=Column(JSON))

    @field_validator("block_type", mode="before")
    @classmethod
    def validate_block_type(cls, v):
        if isinstance(v, str):
            return BlockTypeEnum(v)
        return v


class Block(BlockBase, table=True):
    """Database table model for Block."""

    id: int | None = Field(default=None, primary_key=True)
    course_id: int = Field(
        sa_column=Column("course_id", ForeignKey("course.id", ondelete="CASCADE"))
    )
    chapter_id: int | None = Field(
        default=None,
        sa_column=Column("chapter_id", ForeignKey("chapter.id", ondelete="CASCADE")),
    )
    activity_id: int = Field(
        sa_column=Column("activity_id", ForeignKey("activity.id", ondelete="CASCADE"))
    )
    block_uuid: str
    creation_date: str
    update_date: str


class BlockCreate(BlockBase):
    """Model for creating a new block."""


class BlockRead(BlockBase):
    """Model for reading a block with all related data."""

    id: int
    course_id: int
    chapter_id: int | None
    activity_id: int
    block_uuid: str
    creation_date: str
    update_date: str
