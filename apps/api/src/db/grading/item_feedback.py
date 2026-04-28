"""Inline item feedback attached to grading entries."""

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import Field as PydanticField
from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel


class ItemFeedbackAnnotationType(StrEnum):
    TEXT = "TEXT"
    HIGHLIGHT = "HIGHLIGHT"
    AUDIO = "AUDIO"


class ItemFeedbackEntry(SQLModelStrictBaseModel, table=True):
    """Per-item inline feedback stored separately from the grading JSON blob."""

    __tablename__ = "item_feedback"
    __table_args__ = (
        Index("ix_item_feedback_grading_entry_id", "grading_entry_id"),
        Index("ix_item_feedback_submission_item", "submission_id", "item_ref"),
    )

    id: int | None = Field(default=None, primary_key=True)
    grading_entry_id: int = Field(
        sa_column=Column(
            "grading_entry_id",
            ForeignKey("grading_entry.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    submission_id: int = Field(
        sa_column=Column(
            "submission_id",
            ForeignKey("submission.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    task_id: int | None = Field(
        default=None,
        sa_column=Column(
            "task_id",
            ForeignKey("assignmenttask.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    item_ref: str = Field(sa_column=Column("item_ref", String, nullable=False))
    comment: str = Field(default="", sa_column=Column("comment", Text, nullable=False))
    score: float | None = Field(default=None, sa_column=Column("score", Float))
    max_score: float | None = Field(default=None, sa_column=Column("max_score", Float))
    annotation_type: ItemFeedbackAnnotationType = Field(
        default=ItemFeedbackAnnotationType.TEXT,
        sa_column=Column(
            "annotation_type",
            String,
            nullable=False,
            server_default=ItemFeedbackAnnotationType.TEXT,
        ),
    )
    annotation_data_key: str | None = Field(
        default=None,
        sa_column=Column("annotation_data_key", String, nullable=True),
    )
    graded_by: int | None = Field(
        default=None,
        sa_column=Column(
            "graded_by",
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class ItemFeedbackCreate(SQLModelStrictBaseModel):
    grading_entry_id: int | None = None
    task_id: int | None = None
    item_ref: str = PydanticField(min_length=1, max_length=255)
    comment: str = ""
    score: float | None = PydanticField(default=None, ge=0)
    max_score: float | None = PydanticField(default=None, ge=0)
    annotation_type: ItemFeedbackAnnotationType = ItemFeedbackAnnotationType.TEXT
    annotation_data_key: str | None = None


class ItemFeedbackUpdate(SQLModelStrictBaseModel):
    task_id: int | None = None
    item_ref: str | None = PydanticField(default=None, min_length=1, max_length=255)
    comment: str | None = None
    score: float | None = PydanticField(default=None, ge=0)
    max_score: float | None = PydanticField(default=None, ge=0)
    annotation_type: ItemFeedbackAnnotationType | None = None
    annotation_data_key: str | None = None


class ItemFeedbackRead(SQLModelStrictBaseModel):
    id: int
    grading_entry_id: int
    submission_id: int
    task_id: int | None = None
    item_ref: str
    comment: str
    score: float | None = None
    max_score: float | None = None
    annotation_type: ItemFeedbackAnnotationType
    annotation_data_key: str | None = None
    graded_by: int | None = None
    created_at: datetime
    updated_at: datetime
