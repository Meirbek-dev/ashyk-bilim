"""Submission orchestrator — composes pipeline stages into a single submit flow.

This replaces the old submit.py orchestrator. Each stage is called explicitly
with typed inputs/outputs. Side-effects (XP, plagiarism, notifications) are
emitted via the event bus after the main transaction commits.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func as sql_func
from sqlmodel import Session, select
from ulid import ULID

from src.db.assessments import Assessment, CodeItemAnswer, CodeRunResult
from src.db.code_execution import CodeRunPurpose, CodeRunStatus
from src.db.courses.activities import Activity
from src.db.grading.overrides import StudentPolicyOverride
from src.db.grading.progress import AssessmentPolicy, GradeReleaseMode
from src.db.grading.submissions import (
    AssessmentType,
    Submission,
    SubmissionRead,
    SubmissionStatus,
)
from src.db.users import PublicUser
from src.security.rbac import PermissionChecker
from src.services.code_execution import get_code_execution_service
from src.services.grading.pipeline.context import EffectivePolicy
from src.services.grading.pipeline.emit import emit_submission_events
from src.services.grading.pipeline.enforce import (
    check_violations,
    enforce_attempt_limit,
    enforce_late_submission,
    enforce_time_limit,
    resolve_effective_policy,
)
from src.services.grading.pipeline.grade import grade_attempt
from src.services.grading.pipeline.penalize import apply_penalties
from src.services.grading.pipeline.persist import persist_submission
from src.services.grading.pipeline.validate import validate_and_parse
from src.services.grading.settings_loader import AssessmentSettings
from src.services.progress import submissions as progress_submissions

logger = logging.getLogger(__name__)

_SUBMIT_PERMISSION: dict[AssessmentType, str] = {
    AssessmentType.QUIZ: "assessment:submit",
    AssessmentType.EXAM: "assessment:submit",
    AssessmentType.CODE_CHALLENGE: "assessment:submit",
}


async def submit_assessment(
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
    """Submit an assessment attempt through the canonical pipeline.

    Pipeline:
      1. Permission check
      2. Get-or-create DRAFT
      3. Validate answers
      4. Resolve effective policy
      5. Enforce constraints (attempts, time, late)
      6. Check violations
      7. Run code (CODE_CHALLENGE only)
      8. Grade
      9. Apply penalties
      10. Persist (atomic)
      11. Emit events (post-commit)

    Raises HTTP 504 if the pipeline does not complete within 30 seconds.
    Raises HTTP 500 for unexpected errors (prevents raw 500 frames leaking).
    """
    try:
        async with asyncio.timeout(30):
            return await _submit_assessment_inner(
                activity_id=activity_id,
                assessment_type=assessment_type,
                answers_payload=answers_payload,
                settings=settings,
                current_user=current_user,
                db_session=db_session,
                violation_count=violation_count,
                submission_uuid=submission_uuid,
            )
    except TimeoutError:
        logger.exception(
            "submit_assessment timed out after 30s (activity_id=%s, user_id=%s)",
            activity_id,
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={
                "code": "GRADING_TIMEOUT",
                "message": "Grading pipeline did not complete within the allowed time.",
            },
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "submit_assessment unexpected error (activity_id=%s, user_id=%s)",
            activity_id,
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "GRADING_ERROR",
                "message": "An unexpected error occurred during grading.",
            },
        )


async def _submit_assessment_inner(
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
    # 1. Permission check
    activity = _get_activity_or_404(activity_id, db_session)
    _require_permission(current_user, activity, assessment_type, db_session)

    # 2. Get-or-create DRAFT
    draft = _get_or_create_draft(
        activity_id,
        assessment_type,
        current_user,
        db_session,
        submission_uuid=submission_uuid,
    )

    # 3. Validate answers
    parsed = validate_and_parse(answers_payload, items=settings.items)

    # 4. Resolve effective policy
    policy = _get_assessment_policy(activity_id, db_session)
    override = _active_policy_override(policy, current_user.id, db_session)
    effective = resolve_effective_policy(policy, override, settings)

    # 5. Enforce constraints
    attempt_count = _count_completed_attempts(activity_id, current_user.id, db_session)
    enforce_attempt_limit(effective, attempt_count)
    enforce_time_limit(draft.started_at, effective)
    enforce_late_submission(effective)

    # 6. Check violations
    violation_exceeded = check_violations(settings, violation_count)

    # If violations exceeded, record the auto-submit reason in metadata
    # and cap the violations list at 500 entries.
    MAX_VIOLATIONS_STORED = 500
    if violation_exceeded:
        current_meta: dict = draft.metadata_json or {}
        current_meta["auto_submit_reason"] = "INTEGRITY_VIOLATION"
        current_meta["integrity_violation_count"] = violation_count
        # Cap the violations list to prevent unbounded metadata growth.
        existing_violations: list = current_meta.get("violations", [])
        if len(existing_violations) > MAX_VIOLATIONS_STORED:
            current_meta["violations"] = existing_violations[-MAX_VIOLATIONS_STORED:]
            current_meta["violations_truncated"] = True
        draft.metadata_json = current_meta
        db_session.add(draft)
        db_session.flush()

    # 7. Run code (CODE_CHALLENGE only)
    answers_by_item_uuid = parsed.answers_by_item_uuid
    final_payload = parsed.raw_payload
    if assessment_type == AssessmentType.CODE_CHALLENGE:
        answers_by_item_uuid, final_payload = await _run_final_code_answers(
            db_session=db_session,
            settings=settings,
            answers_by_item_uuid=answers_by_item_uuid,
            answers_payload=final_payload,
            current_user=current_user,
            draft=draft,
        )

    # 8. Grade
    now = datetime.now(UTC)
    result = grade_attempt(
        assessment_type=assessment_type,
        items=settings.items,
        answers_by_item_uuid=answers_by_item_uuid,
        attempt_number=draft.attempt_number,
        max_score=100.0,
        code_strategy=settings.code_strategy,
        max_score_penalty_per_attempt=settings.max_score_penalty_per_attempt,
    )

    # 9. Apply penalties
    penalty = apply_penalties(
        auto_score=result.auto_score,
        effective=effective,
        override=override,
        submitted_at=now,
        attempt_number=draft.attempt_number,
        settings=settings,
        violation_exceeded=violation_exceeded,
        needs_manual_review=result.needs_manual_review,
    )

    # 10. Persist (atomic)
    draft = persist_submission(
        db_session=db_session,
        draft=draft,
        result=result,
        penalty=penalty,
        effective=effective,
        answers_payload=final_payload,
        now=now,
        policy=policy,
        assessment_type=assessment_type,
    )

    # Update progress
    progress_submissions.submit_activity(draft, db_session)

    # 11. Emit events (post-commit, non-blocking)
    _is_code_challenge = assessment_type == AssessmentType.CODE_CHALLENGE
    _immediate_release = (
        policy is None or policy.grade_release_mode == GradeReleaseMode.IMMEDIATE
    )
    await emit_submission_events(
        draft,
        file_keys=_extract_file_keys(final_payload),
        violation_count=violation_count,
        grade_published_at=(
            now
            if (
                not result.needs_manual_review
                and (_is_code_challenge or _immediate_release)
            )
            else None
        ),
    )

    return SubmissionRead.model_validate(draft)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_activity_or_404(activity_id: int, db_session: Session) -> Activity:
    activity = db_session.exec(
        select(Activity).where(Activity.id == activity_id)
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found"
        )
    return activity


def _require_permission(
    current_user: PublicUser,
    activity: Activity,
    assessment_type: AssessmentType,
    db_session: Session,
) -> None:
    permission = _SUBMIT_PERMISSION.get(assessment_type, "assessment:submit")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        permission,
        resource_owner_id=activity.creator_id,
        is_assigned=True,
    )


def _get_or_create_draft(
    activity_id: int,
    assessment_type: AssessmentType,
    current_user: PublicUser,
    db_session: Session,
    *,
    submission_uuid: str | None = None,
) -> Submission:
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
                status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found"
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

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="No active draft found. Call /assessments/{uuid}/start first.",
    )


def _count_completed_attempts(
    activity_id: int, user_id: int, db_session: Session
) -> int:
    return db_session.exec(
        select(sql_func.count()).where(
            Submission.activity_id == activity_id,
            Submission.user_id == user_id,
            Submission.status != SubmissionStatus.DRAFT,
        )
    ).one()


def _get_assessment_policy(
    activity_id: int, db_session: Session
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


async def _run_final_code_answers(
    *,
    db_session: Session,
    settings: AssessmentSettings,
    answers_by_item_uuid: dict[str, Any],
    answers_payload: dict,
    current_user: PublicUser,
    draft: Submission,
) -> tuple[dict[str, Any], dict]:
    """Run final Judge0 grading for canonical CODE answers server-side."""
    code_items = [item for item in settings.items if item.body.kind == "CODE"]
    if not code_items:
        return answers_by_item_uuid, answers_payload

    service = get_code_execution_service()
    assessment = db_session.exec(
        select(Assessment).where(Assessment.activity_id == draft.activity_id)
    ).first()
    assessment_uuid = (
        assessment.assessment_uuid
        if assessment is not None
        else f"activity_{draft.activity_id}"
    )
    enriched_answers = dict(answers_by_item_uuid)
    for item in code_items:
        raw_answer = answers_by_item_uuid.get(item.item_uuid)
        answer = _coerce_code_answer(raw_answer)
        if answer is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Missing CODE answer for item {item.item_uuid}",
            )
        if item.body.languages and answer.language not in item.body.languages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "LANGUAGE_NOT_ALLOWED",
                    "message": f"Language {answer.language} is not allowed.",
                    "allowed_languages": item.body.languages,
                },
            )

        result = await service.run(
            db_session=db_session,
            assessment_uuid=assessment_uuid,
            item_uuid=item.item_uuid,
            submission_uuid=draft.submission_uuid,
            user_id=current_user.id,
            purpose=CodeRunPurpose.FINAL,
            language_id=answer.language,
            source_code=answer.source,
            test_cases=item.body.tests,
            idempotency_key=f"final:{draft.submission_uuid}:{item.item_uuid}:{answer.language}",
            time_limit_seconds=item.body.time_limit_seconds,
            memory_limit_mb=item.body.memory_limit_mb,
        )
        if result.status == CodeRunStatus.DEGRADED:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "CODE_RUNNER_DEGRADED",
                    "message": result.error_message
                    or "Code runner temporarily unavailable.",
                    "is_retryable": True,
                },
            )
        if result.status == CodeRunStatus.COMPILE_ERROR:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "COMPILE_ERROR",
                    "message": "Source code failed to compile.",
                    "compile_output": (
                        result.grading_details()[0].get("compile_output")
                        if result.grading_details()
                        else None
                    ),
                    "item_uuid": item.item_uuid,
                },
            )

        enriched_answers[item.item_uuid] = CodeItemAnswer(
            kind="CODE",
            language=answer.language,
            source=answer.source,
            latest_run=CodeRunResult(
                passed=result.passed,
                total=result.total,
                score=result.score,
                details=result.grading_details(),
            ),
        )

    next_payload = dict(answers_payload)
    next_payload["answers"] = [
        {
            "item_uuid": uuid,
            "answer": ans.model_dump(mode="json")
            if hasattr(ans, "model_dump")
            else ans,
        }
        for uuid, ans in enriched_answers.items()
    ]
    return enriched_answers, next_payload


def _coerce_code_answer(raw_answer: Any) -> CodeItemAnswer | None:
    if isinstance(raw_answer, CodeItemAnswer):
        return raw_answer
    if isinstance(raw_answer, dict):
        try:
            return CodeItemAnswer.model_validate(raw_answer)
        except Exception:
            return None
    return None


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
