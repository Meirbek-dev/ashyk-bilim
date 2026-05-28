"""
Activity settings loader — extracts canonical items and grading config.

Keeps the router layer clean: routers pass activity_id + assessment_type,
this service resolves the assessment + policy and returns a typed
AssessmentSettings object.
"""

from dataclasses import dataclass, field

from sqlmodel import Session, select

from src.db.assessments import ITEM_BODY_ADAPTER, Assessment, AssessmentItem, ItemBody
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
    negative_marking_percent: float = 0.0
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

    Uses the canonical Assessment + AssessmentPolicy as the single source of truth.
    No legacy Block-based fallback.
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
                negative_marking_percent=canonical.negative_marking_percent,
                due_date_iso=canonical.due_date_iso,
                track_violations=canonical.track_violations,
                block_on_violations=canonical.block_on_violations,
                max_violations=canonical.max_violations,
            )
        return AssessmentSettings(items=assessment_items)

    if assessment_type == AssessmentType.EXAM:
        if canonical.kind == "EXAM":
            return AssessmentSettings(
                items=assessment_items,
                max_attempts=canonical.attempt_limit,
                time_limit_seconds=(canonical.time_limit * 60 if canonical.time_limit else None),
                negative_marking_percent=canonical.negative_marking_percent,
                track_violations=any([
                    canonical.copy_paste_protection,
                    canonical.tab_switch_detection,
                    canonical.devtools_detection,
                    canonical.right_click_disable,
                    canonical.fullscreen_enforcement,
                ]),
                max_violations=canonical.violation_threshold or 3,
            )
        return AssessmentSettings(items=assessment_items)

    if assessment_type == AssessmentType.CODE_CHALLENGE:
        if canonical.kind == "CODE_CHALLENGE":
            return AssessmentSettings(
                items=assessment_items,
                due_date_iso=canonical.due_date,
                code_strategy=str(canonical.grading_strategy),
            )
        return AssessmentSettings(items=assessment_items)

    return AssessmentSettings(items=assessment_items)


# ── Canonical item loader ─────────────────────────────────────────────────────


def _load_canonical_items(
    activity_id: int,
    db_session: Session,
) -> list[CanonicalAssessmentItem]:
    assessment = db_session.exec(select(Assessment).where(Assessment.activity_id == activity_id)).first()
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
