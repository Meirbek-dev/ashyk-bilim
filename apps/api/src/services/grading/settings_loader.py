"""
Activity settings loader — extracts canonical items and grading config.

Keeps the router layer clean: routers pass activity_id + assessment_type,
this service resolves the assessment + policy and returns a typed
AssessmentSettings object.
"""

from dataclasses import dataclass, field

from sqlalchemy import desc
from sqlmodel import Session, select

from src.db.assessments import Assessment, AssessmentItem, ITEM_BODY_ADAPTER, ItemBody
from src.db.courses.blocks import Block, BlockTypeEnum
from src.db.courses.quiz import QuizSettings
from src.db.grading.submissions import AssessmentType
from src.services.assessments.settings import get_settings


@dataclass
class CanonicalAssessmentItem:
    """Canonical assessment item payload used by the grading pipeline."""

    item_uuid: str
    kind: str
    title: str
    body: ItemBody
    max_score: float


@dataclass
class AssessmentSettings:
    """Typed grading config for a single activity."""

    questions: list[dict] = field(default_factory=list)
    items: list[CanonicalAssessmentItem] = field(default_factory=list)
    max_attempts: int | None = None
    time_limit_seconds: int | None = None
    max_score_penalty_per_attempt: float | None = None
    due_date_iso: str | None = None
    track_violations: bool = False
    block_on_violations: bool = False
    max_violations: int = 3
    code_strategy: str = "BEST_SUBMISSION"


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
    canonical = get_settings(activity_id, db_session)
    assessment_items = _load_canonical_items(activity_id, db_session)

    if assessment_type == AssessmentType.QUIZ:
        if canonical.kind == "QUIZ":
            return AssessmentSettings(
                questions=canonical.questions,
                items=assessment_items,
                max_attempts=canonical.max_attempts,
                time_limit_seconds=canonical.time_limit_seconds,
                max_score_penalty_per_attempt=canonical.max_score_penalty_per_attempt,
                due_date_iso=canonical.due_date_iso,
                track_violations=canonical.track_violations,
                block_on_violations=canonical.block_on_violations,
                max_violations=canonical.max_violations,
            )
        loaded = _load_quiz_settings(activity_id, db_session)
        loaded.items = assessment_items
        return loaded

    if assessment_type == AssessmentType.EXAM:
        loaded = _load_exam_settings(activity_id, db_session)
        loaded.items = assessment_items
        if canonical.kind == "EXAM":
            loaded.max_attempts = canonical.attempt_limit
            loaded.time_limit_seconds = (
                canonical.time_limit * 60 if canonical.time_limit else None
            )
            loaded.track_violations = any([
                canonical.copy_paste_protection,
                canonical.tab_switch_detection,
                canonical.devtools_detection,
                canonical.right_click_disable,
                canonical.fullscreen_enforcement,
            ])
            loaded.max_violations = canonical.violation_threshold or 3
        return loaded

    # ASSIGNMENT and CODE_CHALLENGE have no timed settings but may have due_date
    if canonical.kind == "CODE_CHALLENGE":
        return AssessmentSettings(
            items=assessment_items,
            due_date_iso=canonical.due_date,
            code_strategy=str(canonical.grading_strategy),
        )
    if canonical.kind == "ASSIGNMENT":
        return AssessmentSettings(
            items=assessment_items,
            due_date_iso=canonical.due_at,
            max_attempts=canonical.attempt_limit,
        )
    loaded = _load_generic_settings(activity_id, db_session)
    loaded.items = assessment_items
    return loaded


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
        time_limit_seconds=_settings_time_limit_seconds(raw_settings) or qs.time_limit_seconds,
        max_score_penalty_per_attempt=qs.max_score_penalty_per_attempt,
        due_date_iso=_settings_due_date_iso(raw_settings),
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
        max_attempts=_settings_int(raw_settings, "max_attempts", "attempt_limit"),
        time_limit_seconds=_settings_time_limit_seconds(raw_settings),
        due_date_iso=_settings_due_date_iso(raw_settings),
    )


def _load_generic_settings(activity_id: int, db_session: Session) -> AssessmentSettings:
    """Load only due_date for ASSIGNMENT / CODE_CHALLENGE (no timed start)."""
    block = _get_block(activity_id, db_session)
    if not block:
        return AssessmentSettings()

    raw_settings: dict = block.content.get("settings", {})
    return AssessmentSettings(
        max_attempts=_settings_int(raw_settings, "max_attempts", "attempt_limit"),
        due_date_iso=_settings_due_date_iso(raw_settings),
    )


def _settings_int(raw_settings: dict[str, object], *keys: str) -> int | None:
    for key in keys:
        value = raw_settings.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, float) and value.is_integer():
            return int(value)
    return None


def _settings_due_date_iso(raw_settings: dict[str, object]) -> str | None:
    for key in ("due_date_iso", "due_at", "due_date"):
        value = raw_settings.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return None


def _settings_time_limit_seconds(raw_settings: dict[str, object]) -> int | None:
    canonical_seconds = _settings_int(raw_settings, "time_limit_seconds")
    if canonical_seconds is not None:
        return canonical_seconds

    legacy_minutes = _settings_int(raw_settings, "time_limit")
    if legacy_minutes is None:
        return None
    return legacy_minutes * 60


def _load_canonical_items(
    activity_id: int,
    db_session: Session,
) -> list[CanonicalAssessmentItem]:
    assessment = db_session.exec(
        select(Assessment).where(Assessment.activity_id == activity_id)
    ).first()
    if assessment is None or assessment.id is None:
        return []

    items = db_session.exec(
        select(AssessmentItem)
        .where(AssessmentItem.assessment_id == assessment.id)
        .order_by(AssessmentItem.order, AssessmentItem.id)
    ).all()
    return [_to_canonical_item(item) for item in items]


def _to_canonical_item(item: AssessmentItem) -> CanonicalAssessmentItem:
    body = ITEM_BODY_ADAPTER.validate_python(item.body_json or {})
    return CanonicalAssessmentItem(
        item_uuid=item.item_uuid,
        kind=str(item.kind),
        title=item.title,
        body=body,
        max_score=float(item.max_score or 0),
    )
