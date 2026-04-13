"""
Activity settings loader — extracts questions and grading config from the DB.

Keeps the router layer clean: routers pass activity_id + assessment_type,
this service fetches the Block and returns a typed AssessmentSettings object.
"""

from dataclasses import dataclass, field

from fastapi import HTTPException, status
from sqlalchemy import desc
from sqlmodel import Session, select

from src.db.courses.blocks import Block, BlockTypeEnum
from src.db.courses.quiz import QuizSettings
from src.db.grading.submissions import AssessmentType


@dataclass
class AssessmentSettings:
    """Typed grading config for a single activity."""

    questions: list[dict] = field(default_factory=list)
    max_attempts: int | None = None
    time_limit_seconds: int | None = None
    max_score_penalty_per_attempt: float | None = None
    due_date_iso: str | None = None
    track_violations: bool = False
    block_on_violations: bool = False
    max_violations: int = 3


def load_activity_settings(
    activity_id: int,
    assessment_type: AssessmentType,
    db_session: Session,
) -> AssessmentSettings:
    """
    Load questions and grading settings for any assessment type.

    Returns default (empty) settings for types that have none — all downstream
    checks treat None/False/0 as "no restriction".
    """
    if assessment_type == AssessmentType.QUIZ:
        return _load_quiz_settings(activity_id, db_session)

    if assessment_type == AssessmentType.EXAM:
        return _load_exam_settings(activity_id, db_session)

    # ASSIGNMENT and CODE_CHALLENGE have no timed settings but may have due_date
    return _load_generic_settings(activity_id, db_session)


# ── Per-type loaders ──────────────────────────────────────────────────────────


def _get_block(
    activity_id: int,
    db_session: Session,
    block_type: BlockTypeEnum | None = None,
) -> Block | None:
    query = select(Block).where(Block.activity_id == activity_id)
    if block_type is not None:
        query = query.where(Block.block_type == block_type)
    return db_session.exec(query.order_by(desc(Block.id))).first()


def _load_quiz_settings(activity_id: int, db_session: Session) -> AssessmentSettings:
    block = _get_block(activity_id, db_session, BlockTypeEnum.BLOCK_QUIZ)
    if not block:
        return AssessmentSettings()

    questions: list[dict] = block.content.get("questions", [])
    raw_settings: dict = block.content.get("settings", {})
    qs = QuizSettings(**raw_settings) if raw_settings else QuizSettings()

    return AssessmentSettings(
        questions=questions,
        max_attempts=qs.max_attempts,
        time_limit_seconds=qs.time_limit_seconds,
        max_score_penalty_per_attempt=qs.max_score_penalty_per_attempt,
        due_date_iso=raw_settings.get("due_date_iso"),
        track_violations=qs.track_violations,
        block_on_violations=qs.block_on_violations,
        max_violations=qs.max_violations,
    )


def _load_exam_settings(activity_id: int, db_session: Session) -> AssessmentSettings:
    block = _get_block(activity_id, db_session)
    if not block:
        return AssessmentSettings()

    questions: list[dict] = block.content.get("questions", [])
    raw_settings: dict = block.content.get("settings", {})

    return AssessmentSettings(
        questions=questions,
        max_attempts=raw_settings.get("max_attempts"),
        due_date_iso=raw_settings.get("due_date_iso"),
    )


def _load_generic_settings(activity_id: int, db_session: Session) -> AssessmentSettings:
    """Load only due_date for ASSIGNMENT / CODE_CHALLENGE (no timed start)."""
    block = _get_block(activity_id, db_session)
    if not block:
        return AssessmentSettings()

    raw_settings: dict = block.content.get("settings", {})
    return AssessmentSettings(
        due_date_iso=raw_settings.get("due_date_iso"),
    )
