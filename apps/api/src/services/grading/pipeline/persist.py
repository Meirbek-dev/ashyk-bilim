"""Pipeline stage: persist submission, grading entry, and progress atomically.

This is the only pipeline stage that performs database I/O. All writes happen
in a single transaction — if any step fails, everything rolls back.
"""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Session
from ulid import ULID

from src.db.grading.entries import GradingEntry
from src.db.grading.progress import AssessmentPolicy, GradeReleaseMode
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.services.grading.pipeline.context import EffectivePolicy, PenaltyResult
from src.services.grading.registry import GradingResult
from src.services.progress.submissions import (
    _attach_policy,
    recalculate_activity_progress,
)
from src.types import JsonObject


def persist_submission(
    db_session: Session,
    draft: Submission,
    result: GradingResult,
    penalty: PenaltyResult,
    effective: EffectivePolicy,
    answers_payload: JsonObject,
    now: datetime,
    policy: AssessmentPolicy | None = None,
    assessment_type: AssessmentType | None = None,
) -> Submission:
    """Write submission + GradingEntry + progress in one transaction.

    Returns the refreshed submission after commit.
    """
    # Determine post-submission status
    grade_release = policy.grade_release_mode if policy is not None else GradeReleaseMode.IMMEDIATE
    new_status = _resolve_status(result, grade_release, assessment_type)

    raw_breakdown = result.breakdown.model_dump()

    # Write submission fields
    draft.answers_json = answers_payload
    draft.raw_grading_json = raw_breakdown
    draft.grading_json = raw_breakdown
    effective_breakdown = raw_breakdown
    draft.auto_score = result.auto_score if not penalty.violation_zeroed else 0.0
    draft.late_penalty_pct = penalty.late_penalty_pct
    draft.final_score = penalty.final_score if not result.needs_manual_review else None
    draft.status = new_status
    draft.is_late = effective.due_at is not None and now > effective.due_at
    draft.submitted_at = now
    draft.graded_at = now if new_status in {SubmissionStatus.GRADED, SubmissionStatus.PUBLISHED} else None
    draft.updated_at = now

    # Ensure policy is attached for progress calculation
    _attach_policy(draft, db_session)
    db_session.add(draft)

    # Create immutable grading entry for auto-graded submissions
    if not result.needs_manual_review and draft.id is not None:
        db_session.add(
            GradingEntry(
                entry_uuid=f"entry_{ULID()}",
                submission_id=draft.id,
                graded_by=draft.user_id,
                raw_score=float(result.auto_score),
                penalty_pct=float(penalty.late_penalty_pct),
                final_score=float(penalty.final_score),
                raw_breakdown=raw_breakdown,
                effective_breakdown=effective_breakdown,
                overall_feedback=(
                    effective_breakdown.get("feedback", "") if isinstance(effective_breakdown, dict) else ""
                ),
                grading_version=draft.grading_version,
                created_at=now,
                published_at=(now if new_status == SubmissionStatus.PUBLISHED else None),
            )
        )

    # Recalculate progress (same transaction)
    recalculate_activity_progress(
        draft.activity_id,
        draft.user_id,
        db_session,
        commit=False,
    )

    db_session.commit()
    db_session.refresh(draft)
    return draft


def _resolve_status(
    result: GradingResult,
    grade_release: GradeReleaseMode = GradeReleaseMode.IMMEDIATE,
    assessment_type: AssessmentType | None = None,
) -> SubmissionStatus:
    """Determine post-submission status from grading result.

    CODE_CHALLENGE always publishes immediately (ADR-003).
    AUTO grade_release + no manual review → PUBLISHED immediately (ADR-002).
    """
    if result.needs_manual_review:
        return SubmissionStatus.PENDING
    # CODE_CHALLENGE: always immediately visible (ADR-003)
    if assessment_type == AssessmentType.CODE_CHALLENGE:
        return SubmissionStatus.PUBLISHED
    if grade_release == GradeReleaseMode.IMMEDIATE:
        return SubmissionStatus.PUBLISHED
    return SubmissionStatus.GRADED
