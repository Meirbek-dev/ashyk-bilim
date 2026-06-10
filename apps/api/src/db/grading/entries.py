"""GradingEntry — append-only grading ledger.

Every time a teacher saves or publishes a grade a new GradingEntry row is
inserted.  The row is **never updated** — historical entries are the audit
trail.  The current grade is always the latest entry by ``created_at``.

The ``published_at`` timestamp controls student visibility:
  - NULL  → draft (teacher-only; student cannot see the grade yet)
  - non-NULL → visible to the student

Immutability is enforced via SQLAlchemy event listeners:
  - ``before_update`` raises an ``IntegrityError`` for any field change other
    than ``published_at`` (publishing a draft entry is allowed).
  - ``before_delete`` always raises an ``IntegrityError``.
"""

from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    event,
)
from sqlalchemy.exc import IntegrityError
from sqlmodel import Field

from src.db.strict_base_model import SQLModelStrictBaseModel
from src.types import JsonObject

# ── Constants ─────────────────────────────────────────────────────────────────

# Virtual user ID used by automated grading pipelines.  A graded_by value of
# SYSTEM_GRADER_ID means the grade was applied without human intervention.
SYSTEM_GRADER_ID: int = 0

# Fields that may legitimately change after insertion (publishing workflow).
_MUTABLE_FIELDS: frozenset[str] = frozenset({"published_at"})


class GradingEntry(SQLModelStrictBaseModel, table=True):
    """Immutable ledger row recording one grading event for a submission."""

    __tablename__: ClassVar[str] = "grading_entry"  # type: ignore[mutable-override]  # pyright: ignore[reportIncompatibleVariableOverride]
    __table_args__ = (
        UniqueConstraint("entry_uuid", name="uq_grading_entry_uuid"),
        Index("ix_grading_entry_submission_id", "submission_id"),
        Index(
            "ix_grading_entry_submission_published",
            "submission_id",
            "published_at",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    entry_uuid: str = Field(index=True)

    submission_id: int = Field(
        sa_column=Column(
            "submission_id",
            ForeignKey("submission.id", ondelete="CASCADE"),
            nullable=False,
        )
    )
    graded_by: int = Field(
        sa_column=Column(
            "graded_by",
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        )
    )

    # Scores — all 0-100 scale
    raw_score: float = Field(sa_column=Column("raw_score", Float, nullable=False))
    penalty_pct: float = Field(
        default=0.0,
        sa_column=Column("penalty_pct", Float, nullable=False, server_default="0"),
    )
    final_score: float = Field(sa_column=Column("final_score", Float, nullable=False))

    raw_breakdown: JsonObject = Field(
        default_factory=dict,
        sa_column=Column("raw_breakdown", JSON, nullable=False, server_default="{}"),
    )
    effective_breakdown: JsonObject = Field(
        default_factory=dict,
        sa_column=Column("effective_breakdown", JSON, nullable=False, server_default="{}"),
    )

    # Teacher's overall comment — stored separately from per-item breakdown
    overall_feedback: str = Field(
        default="",
        sa_column=Column("overall_feedback", Text, nullable=False, server_default=""),
    )

    # Grading version — mirrors Submission.grading_version for schema evolution
    grading_version: int = Field(
        default=1,
        sa_column=Column("grading_version", Integer, nullable=False, server_default="1"),
    )

    # Immutable timestamps — created_at is never updated
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column("created_at", DateTime(timezone=True), nullable=False),
    )

    # NULL = draft (teacher-only).  Non-null = published and visible to student.
    published_at: datetime | None = Field(
        default=None,
        sa_column=Column("published_at", DateTime(timezone=True), nullable=True),
    )


class GradingEntryRead(SQLModelStrictBaseModel):
    """API projection of a grading entry."""

    id: int
    entry_uuid: str
    submission_id: int
    graded_by: int | None = None
    raw_score: float
    penalty_pct: float
    final_score: float
    raw_breakdown: JsonObject
    effective_breakdown: JsonObject
    overall_feedback: str
    grading_version: int
    created_at: datetime
    published_at: datetime | None = None


# ── Immutability event listeners ──────────────────────────────────────────────


@event.listens_for(GradingEntry, "before_update")
def _prevent_grading_entry_update(mapper: object, connection: object, target: GradingEntry) -> None:  # pyright: ignore[reportUnusedFunction]
    """Block any column change except ``published_at``.

    SQLAlchemy's ``get_history()`` returns (added, unchanged, deleted) tuples.
    A field is considered changed when the "added" bucket is non-empty.
    """
    from sqlalchemy import inspect as sa_inspect

    state = sa_inspect(target)
    if state is None:
        return
    changed_fields = {attr.key for attr in state.attrs if attr.history.added and attr.key not in _MUTABLE_FIELDS}
    if changed_fields:
        raise IntegrityError(
            statement=None,
            params=None,
            orig=Exception(
                f"GradingEntry is immutable. Attempted to modify: {sorted(changed_fields)}. "
                "Create a new GradingEntry instead."
            ),
        )


@event.listens_for(GradingEntry, "before_delete")
def _prevent_grading_entry_delete(mapper: object, connection: object, target: GradingEntry) -> None:  # pyright: ignore[reportUnusedFunction]
    """Block all DELETE operations on GradingEntry rows."""
    raise IntegrityError(
        statement=None,
        params=None,
        orig=Exception(
            f"GradingEntry (id={target.id}, uuid={target.entry_uuid}) cannot be deleted. "
            "The grading ledger is append-only."
        ),
    )
