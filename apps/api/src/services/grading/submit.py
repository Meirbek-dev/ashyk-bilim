"""
Submission orchestrator — single entry point per lifecycle action.

Each concern is isolated in a private helper so it can be tested independently:

  start_submission   → create DRAFT with server-stamped start time
  submit_assessment  → validate → grade → persist → award XP
"""

import logging
from datetime import UTC, datetime
from math import ceil
from typing import Any

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select
from ulid import ULID

import src.services.integrations.plagiarism
from src.db.assessments import ITEM_ANSWER_ADAPTER
from src.db.courses.activities import Activity
from src.db.gamification import XPSource
from src.db.grading.entries import GradingEntry
from src.db.grading.overrides import StudentPolicyOverride
from src.db.grading.progress import AssessmentPolicy, GradeReleaseMode
from src.db.grading.submissions import (
    AssessmentType,
    Submission,
    SubmissionRead,
    SubmissionStatus,
)
from src.db.grading.progress import LATE_POLICY_ADAPTER
from src.db.users import PublicUser
from src.security.rbac import PermissionChecker
from src.services.gamification.service import award_xp as _gamification_award_xp
from src.services.grading.assignment_breakdown import build_effective_grading_breakdown
from src.services.grading.grader import grade_submission
from src.services.grading.settings_loader import AssessmentSettings
from src.services.grading.submission import SubmissionSubmittedEvent, event_bus
from src.services.progress import submissions as progress_submissions

logger = logging.getLogger(__name__)

# Per-type submit permission
_SUBMIT_PERMISSION: dict[AssessmentType, str] = {
    AssessmentType.QUIZ: "assessment:submit",
    AssessmentType.EXAM: "assessment:submit",
    AssessmentType.ASSIGNMENT: "assessment:submit",
    AssessmentType.CODE_CHALLENGE: "assessment:submit",
}

# Per-type XP source
_XP_SOURCE: dict[AssessmentType, XPSource] = {
    AssessmentType.QUIZ: XPSource.QUIZ_COMPLETION,
    AssessmentType.EXAM: XPSource.EXAM_COMPLETION,
    AssessmentType.ASSIGNMENT: XPSource.ASSIGNMENT_SUBMISSION,
    AssessmentType.CODE_CHALLENGE: XPSource.CODE_CHALLENGE_COMPLETION,
}


async def start_submission(
    request: Request | None,
    activity_id: int,
    assessment_type: AssessmentType,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionRead:
    """
    Create a DRAFT Submission and record the server-stamped start time.

    Idempotent — returns the existing DRAFT if one is already open.
    The started_at timestamp is set here so clients cannot falsify it.
    """
    activity = _get_activity_or_404(activity_id, db_session)
    _require_permission(current_user, activity, assessment_type, db_session)

    policy = _get_assessment_policy(activity_id, db_session)
    override = _active_policy_override(policy, current_user.id, db_session)
    _enforce_attempt_limit(
        activity_id,
        current_user.id,
        None,
        db_session,
        policy=policy,
        override=override,
    )

    existing_draft = db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity_id,
            Submission.user_id == current_user.id,
            Submission.status == SubmissionStatus.DRAFT,
        )
    ).first()

    if existing_draft:
        progress_submissions.start_activity_submission(existing_draft, db_session)
        return SubmissionRead.model_validate(existing_draft)

    attempt_number = (
        _count_previous_attempts(activity_id, current_user.id, db_session) + 1
    )
    now = datetime.now(UTC)

    submission = Submission(
        submission_uuid=f"submission_{ULID()}",
        assessment_type=assessment_type,
        activity_id=activity_id,
        user_id=current_user.id,
        status=SubmissionStatus.DRAFT,
        attempt_number=attempt_number,
        answers_json={},
        grading_json={},
        started_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(submission)
    db_session.commit()
    db_session.refresh(submission)
    progress_submissions.start_activity_submission(submission, db_session)
    return SubmissionRead.model_validate(submission)


async def submit_assessment(
    request: Request | None,
    activity_id: int,
    assessment_type: AssessmentType,
    answers_payload: dict,
    settings: AssessmentSettings,
    current_user: PublicUser,
    db_session: Session,
    *,
    violation_count: int = 0,
    submission_uuid: str | None = None,
) -> SubmissionRead:
    """
    Submit an assessment attempt and auto-grade where possible.

    Pipeline:
      1. Permission check
      2. Get-or-create DRAFT
      3. Enforce attempt limit
      4. Enforce time limit
      5. Check violations
      6. Grade
      7. Resolve status (PENDING vs GRADED)
      8. Persist
      9. Award XP
    """
    activity = _get_activity_or_404(activity_id, db_session)
    _require_permission(current_user, activity, assessment_type, db_session)

    policy = _get_assessment_policy(activity_id, db_session)
    override = _active_policy_override(policy, current_user.id, db_session)

    draft = _get_or_create_draft(
        activity_id,
        assessment_type,
        current_user,
        db_session,
        submission_uuid=submission_uuid,
    )

    _enforce_attempt_limit(
        activity_id,
        current_user.id,
        settings,
        db_session,
        policy=policy,
        override=override,
    )
    _enforce_time_limit(draft, settings)

    violation_exceeded = _check_violations(settings, violation_count)

    # Prefer canonical answers[item_uuid] grading inputs, fall back to legacy shapes.
    (
        answers_by_item_uuid,
        user_answers,
        exam_answers,
        test_results,
        code_strategy,
    ) = _parse_answers(
        assessment_type, answers_payload
    )

    result = grade_submission(
        assessment_type=assessment_type,
        items=settings.items,
        answers_by_item_uuid=answers_by_item_uuid,
        questions=settings.questions,
        user_answers=user_answers,
        exam_answers=exam_answers,
        test_results=test_results,
        code_strategy=code_strategy or settings.code_strategy,
        attempt_number=draft.attempt_number,
        max_score_penalty_per_attempt=settings.max_score_penalty_per_attempt,
    )

    now = datetime.now(UTC)
    due_at = _effective_due_at(settings, policy, override)
    is_late = due_at is not None and now > due_at
    if is_late and policy is not None and not policy.allow_late:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Late submissions are not allowed for this activity",
        )
    late_penalty_pct = (
        0.0
        if override is not None and override.waive_late_penalty
        else _calculate_late_penalty(now, due_at, policy)
    )
    final_auto_score = 0.0 if violation_exceeded else result.auto_score
    new_status = _resolve_status(assessment_type, result)

    _persist_submission(
        draft=draft,
        answers_payload=answers_payload,
        result=result,
        status=new_status,
        auto_score=final_auto_score,
        is_late=is_late,
        late_penalty_pct=late_penalty_pct,
        now=now,
        db_session=db_session,
        policy=policy,
    )
    progress_submissions.submit_activity(draft, db_session)

    passed = (draft.auto_score or 0) >= 50.0
    if (
        assessment_type != AssessmentType.ASSIGNMENT
        and passed
        and not violation_exceeded
        and not is_late
    ):
        _award_xp_safe(
            current_user.id, assessment_type, draft.submission_uuid, db_session
        )

    await event_bus.emit(
        SubmissionSubmittedEvent(
            submission_uuid=draft.submission_uuid,
            assessment_type=assessment_type,
            user_id=current_user.id,
            activity_id=activity_id,
            attempt_number=draft.attempt_number,
            file_keys=_extract_file_keys(answers_payload),
        )
    )

    return SubmissionRead.model_validate(draft)


# ── Pipeline steps ────────────────────────────────────────────────────────────


def _get_or_create_draft(
    activity_id: int,
    assessment_type: AssessmentType,
    current_user: PublicUser,
    db_session: Session,
    *,
    submission_uuid: str | None = None,
) -> Submission:
    """
    Return the open DRAFT for this user/activity, or create one.

    ASSIGNMENT type has no timed start, so it's valid to submit without
    calling start_submission first. All other types require the DRAFT to
    already exist (created by start_submission).
    """
    if submission_uuid is not None:
        draft = db_session.exec(
            select(Submission).where(
                Submission.submission_uuid == submission_uuid,
                Submission.activity_id == activity_id,
                Submission.user_id == current_user.id,
                Submission.assessment_type == assessment_type,
            )
        ).first()
        if draft is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Submission not found",
            )
        if draft.status != SubmissionStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Submission is not a DRAFT (current status: {draft.status})",
            )
        return draft

    draft = db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity_id,
            Submission.user_id == current_user.id,
            Submission.status == SubmissionStatus.DRAFT,
        )
    ).first()

    if draft:
        return draft

    if assessment_type != AssessmentType.ASSIGNMENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active draft found. Call /grading/start first.",
        )

    # ASSIGNMENT: create the draft inline (no server-stamped start needed)
    attempt_number = (
        _count_previous_attempts(activity_id, current_user.id, db_session) + 1
    )
    now = datetime.now(UTC)
    draft = Submission(
        submission_uuid=f"submission_{ULID()}",
        assessment_type=assessment_type,
        activity_id=activity_id,
        user_id=current_user.id,
        status=SubmissionStatus.DRAFT,
        attempt_number=attempt_number,
        answers_json={},
        grading_json={},
        started_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(draft)
    db_session.flush()
    return draft


def _count_previous_attempts(
    activity_id: int, user_id: int, db_session: Session
) -> int:
    """Count all non-DRAFT submissions (including RETURNED) as prior attempts."""
    return len(
        db_session.exec(
            select(Submission).where(
                Submission.activity_id == activity_id,
                Submission.user_id == user_id,
                Submission.status != SubmissionStatus.DRAFT,
            )
        ).all()
    )


def _enforce_attempt_limit(
    activity_id: int,
    user_id: int,
    settings: AssessmentSettings | None,
    db_session: Session,
    *,
    policy: AssessmentPolicy | None = None,
    override: StudentPolicyOverride | None = None,
) -> None:
    max_attempts = settings.max_attempts if settings is not None else None
    if policy is not None:
        max_attempts = policy.max_attempts
    if override is not None and override.max_attempts_override is not None:
        max_attempts = override.max_attempts_override

    if not max_attempts:
        return
    # Count all non-DRAFT submissions — PUBLISHED and RETURNED must count too,
    # otherwise students bypass the limit by repeatedly getting submissions returned.
    completed = db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity_id,
            Submission.user_id == user_id,
            Submission.status != SubmissionStatus.DRAFT,
        )
    ).all()
    if len(completed) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Maximum attempts ({max_attempts}) reached",
        )


_SUBMIT_GRACE_SECONDS = 30  # tolerance for network latency at the time-limit boundary


def _enforce_time_limit(draft: Submission, settings: AssessmentSettings) -> None:
    if not draft.started_at or not settings.time_limit_seconds:
        return
    started_at = draft.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=UTC)
    elapsed = (datetime.now(UTC) - started_at).total_seconds()
    if elapsed > settings.time_limit_seconds + _SUBMIT_GRACE_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Time limit ({settings.time_limit_seconds}s) exceeded",
        )


def _check_violations(settings: AssessmentSettings, violation_count: int) -> bool:
    """Return True if violations should zero out the score.

    max_violations is the inclusive upper limit — reaching it triggers zeroing.
    """
    return (
        settings.track_violations
        and settings.block_on_violations
        and violation_count >= settings.max_violations
    )


def _parse_answers(
    assessment_type: AssessmentType,
    answers_payload: dict,
) -> tuple[
    dict[str, Any],
    list[dict],
    dict[int, dict] | None,
    list[dict] | None,
    str,
]:
    """Extract per-type answer fields from the raw payload."""
    answers_by_item_uuid = _extract_canonical_answers(answers_payload)
    user_answers: list[dict] = answers_payload.get("answers", [])
    exam_answers: dict[int, dict] | None = None
    test_results: list[dict] | None = None
    code_strategy = "BEST_SUBMISSION"

    if answers_by_item_uuid:
        return (
            answers_by_item_uuid,
            user_answers,
            exam_answers,
            test_results,
            code_strategy,
        )

    if assessment_type == AssessmentType.EXAM:
        raw = answers_payload.get("submitted_answers", {})
        if isinstance(raw, dict):
            exam_answers = {int(k): v for k, v in raw.items() if str(k).isdigit()}

    elif assessment_type == AssessmentType.CODE_CHALLENGE:
        test_results = answers_payload.get("test_results", [])
        code_strategy = answers_payload.get("code_strategy", "BEST_SUBMISSION")

    return answers_by_item_uuid, user_answers, exam_answers, test_results, code_strategy


def _extract_canonical_answers(answers_payload: object) -> dict[str, Any]:
    if not isinstance(answers_payload, dict):
        return {}
    raw_answers = answers_payload.get("answers")
    if isinstance(raw_answers, dict):
        normalized: dict[str, Any] = {}
        for item_uuid, raw_answer in raw_answers.items():
            if not isinstance(item_uuid, str):
                continue
            try:
                normalized[item_uuid] = ITEM_ANSWER_ADAPTER.validate_python(raw_answer)
            except Exception:
                if isinstance(raw_answer, dict):
                    normalized[item_uuid] = raw_answer
        return normalized

    if isinstance(raw_answers, list):
        normalized = {}
        for entry in raw_answers:
            if not isinstance(entry, dict):
                continue
            item_uuid = entry.get("item_uuid")
            raw_answer = entry.get("answer")
            if not isinstance(item_uuid, str) or not isinstance(raw_answer, dict):
                continue
            try:
                normalized[item_uuid] = ITEM_ANSWER_ADAPTER.validate_python(raw_answer)
            except Exception:
                normalized[item_uuid] = raw_answer
        return normalized
    return {}


def _extract_file_keys(payload: object) -> list[str]:
    keys: list[str] = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key == "file_key" and isinstance(value, str) and value:
                keys.append(value)
            else:
                keys.extend(_extract_file_keys(value))
    elif isinstance(payload, list):
        for item in payload:
            keys.extend(_extract_file_keys(item))
    return keys


def _detect_late(due_date_iso: str | None, now: datetime) -> bool:
    if not due_date_iso:
        return False
    try:
        due_date = datetime.fromisoformat(due_date_iso)
        if due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=UTC)
        return now > due_date
    except ValueError:
        return False


def _effective_due_at(
    settings: AssessmentSettings,
    policy: AssessmentPolicy | None,
    override: StudentPolicyOverride | None,
) -> datetime | None:
    due_at = policy.due_at if policy is not None else None
    if override is not None and override.due_at_override is not None:
        due_at = override.due_at_override
    if due_at is None and settings.due_date_iso:
        try:
            due_at = datetime.fromisoformat(settings.due_date_iso)
        except ValueError:
            return None
    if due_at is None:
        return None
    return due_at if due_at.tzinfo else due_at.replace(tzinfo=UTC)


def _calculate_late_penalty(
    submitted_at: datetime,
    due_at: datetime | None,
    policy: AssessmentPolicy | None,
) -> float:
    """Return late penalty percentage for all supported LatePolicy types."""
    if due_at is None or submitted_at <= due_at:
        return 0.0
    if policy is None or not policy.allow_late:
        return 0.0

    late_policy = LATE_POLICY_ADAPTER.validate_python(policy.late_policy_json or {})

    if late_policy.kind == "NONE":
        return 0.0
    if late_policy.kind == "CUTOFF":
        return 100.0 if submitted_at > late_policy.cutoff_at else 0.0
    if late_policy.kind == "PENALTY":
        seconds_late = max(0.0, (submitted_at - due_at).total_seconds())
        days_late = min(late_policy.max_days, max(1, ceil(seconds_late / 86400)))
        max_pct = _clamp_pct(days_late * late_policy.percent_per_day)
        return min(100.0, max_pct)
    return 0.0


def _float_or_zero(value: object) -> float:
    try:
        return float(value)
    except TypeError, ValueError:
        return 0.0


def _clamp_pct(value: object) -> float:
    return max(0.0, min(100.0, _float_or_zero(value)))


def _apply_late_penalty(score: float, penalty_pct: float) -> float:
    return round(score * (1 - _clamp_pct(penalty_pct) / 100), 2)


def _resolve_status(
    assessment_type: AssessmentType,
    result: object,
) -> SubmissionStatus:
    """
    Determine the post-submission status.

    Any fully auto-graded submission (quiz, code challenge, or exam with only
    auto-gradeable question types) goes straight to GRADED — no teacher action
    needed. Anything with manual-review items goes to PENDING.
    """
    if not result.needs_manual_review:
        return SubmissionStatus.GRADED
    return SubmissionStatus.PENDING


def _persist_submission(
    draft: Submission,
    answers_payload: dict,
    result: object,
    status: SubmissionStatus,
    auto_score: float,
    is_late: bool,
    late_penalty_pct: float,
    now: datetime,
    db_session: Session,
    policy: AssessmentPolicy | None,
) -> None:
    draft.answers_json = answers_payload
    draft.grading_json = result.breakdown.model_dump()
    draft.grading_json = build_effective_grading_breakdown(
        draft, db_session
    ).model_dump()
    draft.auto_score = auto_score
    draft.late_penalty_pct = late_penalty_pct
    draft.final_score = (
        _apply_late_penalty(auto_score, late_penalty_pct)
        if not result.needs_manual_review
        else None
    )
    draft.status = status
    draft.is_late = is_late
    draft.submitted_at = now
    draft.graded_at = now if status == SubmissionStatus.GRADED else None
    draft.updated_at = now
    db_session.add(draft)
    if not result.needs_manual_review and draft.id is not None:
        db_session.add(
            GradingEntry(
                entry_uuid=f"entry_{ULID()}",
                submission_id=draft.id,
                graded_by=draft.user_id,
                raw_score=float(auto_score),
                penalty_pct=float(late_penalty_pct),
                final_score=float(draft.final_score or 0),
                breakdown=draft.grading_json,
                overall_feedback=(
                    draft.grading_json.get("feedback", "")
                    if isinstance(draft.grading_json, dict)
                    else ""
                ),
                grading_version=draft.grading_version,
                created_at=now,
                published_at=(
                    now
                    if policy is None
                    or policy.grade_release_mode == GradeReleaseMode.IMMEDIATE
                    else None
                ),
            )
        )
    db_session.commit()
    db_session.refresh(draft)


def _get_assessment_policy(
    activity_id: int,
    db_session: Session,
) -> AssessmentPolicy | None:
    return db_session.exec(
        select(AssessmentPolicy).where(AssessmentPolicy.activity_id == activity_id)
    ).first()


def _active_policy_override(
    policy: AssessmentPolicy | None,
    user_id: int,
    db_session: Session,
) -> StudentPolicyOverride | None:
    if policy is None or policy.id is None:
        return None
    now = datetime.now(UTC)
    override = db_session.exec(
        select(StudentPolicyOverride).where(
            StudentPolicyOverride.policy_id == policy.id,
            StudentPolicyOverride.user_id == user_id,
        )
    ).first()
    if override is None:
        return None
    if override.expires_at is not None:
        expires_at = (
            override.expires_at
            if override.expires_at.tzinfo
            else override.expires_at.replace(tzinfo=UTC)
        )
        if expires_at <= now:
            return None
    return override


def _award_xp_safe(
    user_id: int,
    assessment_type: AssessmentType,
    submission_uuid: str,
    db_session: Session,
) -> None:
    """Award XP for a passed submission.  Errors are logged and swallowed so a
    gamification failure never rolls back the submission itself."""
    xp_source = _XP_SOURCE.get(assessment_type, XPSource.QUIZ_COMPLETION)
    try:
        _gamification_award_xp(
            db=db_session,
            user_id=user_id,
            source=xp_source.value,
            source_id=submission_uuid,
            idempotency_key=f"submission_{submission_uuid}",
        )
        db_session.commit()
    except Exception as e:  # noqa: BLE001
        logger.warning("Failed to award XP for submission %s: %s", submission_uuid, e)
        db_session.rollback()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_activity_or_404(activity_id: int, db_session: Session) -> Activity:
    activity = db_session.exec(
        select(Activity).where(Activity.id == activity_id)
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )
    return activity


def _require_permission(
    current_user: PublicUser,
    activity: Activity,
    assessment_type: AssessmentType,
    db_session: Session,
) -> None:
    permission = _SUBMIT_PERMISSION.get(assessment_type, "quiz:submit")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        permission,
        resource_owner_id=activity.creator_id,
        is_assigned=True,
    )
