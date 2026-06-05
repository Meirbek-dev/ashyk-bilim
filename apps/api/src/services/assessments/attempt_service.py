"""Assessment service — student attempt flow."""

import logging
from datetime import UTC, datetime, timedelta
from typing import cast

from fastapi import HTTPException, status
from sqlalchemy import desc
from sqlmodel import Session, col, select

from src.db.assessments import (
    ITEM_BODY_ADAPTER,
    Assessment,
    AssessmentAttemptProjection,
    AssessmentDraftPatch,
    AssessmentDraftRead,
    AssessmentItem,
    CodeRunRequest,
    CodeRunResponse,
    GradingDraftSave,
    ItemKind,
    StudentSubmissionRead,
    TeacherSubmissionRead,
)
from src.db.code_execution import CodeRunPurpose, CodeRunStatus
from src.db.grading.submissions import (
    AssessmentType,
    Submission,
    SubmissionStatus,
)
from src.db.users import PublicUser
from src.services.assessments._shared import (
    _assert_attempt_action_allowed,
    _build_attempt_state,
    _build_student_submission_read,
    _build_teacher_submission_read,
    _content_version,
    _enforce_draft_version,
    _get_activity_and_course,
    _get_assessment_by_uuid_or_404,
    _get_assessment_submission_or_404,
    _get_item_or_404,
    _get_items,
    _get_or_create_submission_draft,
    _get_policy_for_assessment,
    _is_result_visible,
    _is_teacher_preview_user,
    _normalize_answer_patch,
    _parse_if_match_version,
    _policy_version,
    _release_state_for_submission,
    _require_grade,
    _require_submit_access,
    _score_projection_from_submission,
    _snapshot_submission,
)
from src.services.cache.redis_client import get_async_redis_client
from src.services.code_execution import get_code_execution_service
from src.services.grading.pipeline.orchestrator import (
    submit_assessment as submit_assessment_pipeline,
)
from src.services.grading.settings_loader import load_activity_settings
from src.services.grading.submission import start_submission_v2
from src.services.grading.teacher import _save_teacher_grade
from src.services.progress import submissions as progress_submissions
from src.types import JsonObject, require_persisted_id

logger = logging.getLogger(__name__)


async def start_assessment(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> StudentSubmissionRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _assert_attempt_action_allowed(
        action="start",
        assessment=assessment,
        activity=activity,
        course=course,
        current_user=current_user,
        db_session=db_session,
    )
    activity_id = require_persisted_id(activity.id, model_name="Activity")
    is_teacher_preview = _is_teacher_preview_user(current_user, activity, course, db_session)
    try:
        result = start_submission_v2(
            activity_id=activity_id,
            assessment_type=AssessmentType(assessment.kind),
            current_user=current_user,
            db_session=db_session,
            skip_permission=is_teacher_preview,
            skip_attempt_limit=is_teacher_preview,
        )
        submission = db_session.exec(
            select(Submission).where(Submission.submission_uuid == result.submission_uuid)
        ).first()
        if submission is None:
            raise HTTPException(status_code=500, detail="Отправка не была создана")
        return _build_student_submission_read(submission, db_session)
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "ASSESSMENT_SUPPORT_ALERT start_assessment failed assessment_uuid=%s activity_uuid=%s user_id=%s",
            assessment.assessment_uuid,
            activity.activity_uuid,
            current_user.id,
        )
        raise


async def get_my_assessment_submissions(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list[StudentSubmissionRead]:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_submit_access(current_user, activity, course, db_session)
    submissions = db_session.exec(
        select(Submission)
        .where(
            Submission.activity_id == activity.id,
            Submission.user_id == current_user.id,
        )
        .order_by(desc(col(Submission.created_at)))
    ).all()
    return [_build_student_submission_read(submission, db_session) for submission in submissions]


async def get_my_assessment_draft(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentDraftRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_submit_access(current_user, activity, course, db_session)
    draft = db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity.id,
            Submission.user_id == current_user.id,
            Submission.status == SubmissionStatus.DRAFT,
        )
    ).first()
    return AssessmentDraftRead(
        assessment_uuid=assessment.assessment_uuid,
        submission=_build_student_submission_read(draft, db_session) if draft else None,
    )


async def save_assessment_draft(
    assessment_uuid: str,
    payload: AssessmentDraftPatch,
    current_user: PublicUser,
    db_session: Session,
    *,
    if_match: str | None = None,
    enforce_throttle: bool = True,
) -> StudentSubmissionRead:
    DRAFT_THROTTLE_TTL = 5  # seconds

    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _assert_attempt_action_allowed(
        action="save_draft",
        assessment=assessment,
        activity=activity,
        course=course,
        current_user=current_user,
        db_session=db_session,
    )

    try:
        draft = _get_or_create_submission_draft(
            assessment=assessment,
            activity=activity,
            current_user=current_user,
            db_session=db_session,
        )

        # ── Redis rate-limiting: at most one save per 5 s per submission ──────
        redis = get_async_redis_client()
        throttle_key = f"draft_throttle:{draft.submission_uuid}"
        if enforce_throttle and redis is not None and await redis.exists(throttle_key):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "DRAFT_SAVE_THROTTLED",
                    "message": (
                        f"Черновик сохранен слишком недавно. Подождите {DRAFT_THROTTLE_TTL} секунд между сохранениями."
                    ),
                    "retry_after_seconds": DRAFT_THROTTLE_TTL,
                },
                headers={"Retry-After": str(DRAFT_THROTTLE_TTL)},
            )

        _enforce_draft_version(draft, if_match)

        answers = _normalize_answer_patch(assessment, payload, current_user, db_session)
        current_payload = cast("dict[str, object]", draft.answers_json)
        raw_answers = current_payload.get("answers")
        current_answers = cast("dict[str, object]", raw_answers) if isinstance(raw_answers, dict) else {}

        merged_answers: dict[str, object] = {**current_answers, **answers}
        draft.answers_json = cast("JsonObject", {
            **current_payload,
            "answers": merged_answers,
        })
        draft.draft_version += 1
        draft.updated_at = datetime.now(UTC)

        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)
        progress_submissions.save_activity_draft(draft, db_session)

        # ── Set throttle key after successful save ────────────────────────────
        if enforce_throttle and redis is not None:
            await redis.set(throttle_key, "1", ex=DRAFT_THROTTLE_TTL)

        # ── Build response with progress metadata ─────────────────────────────
        result = _build_student_submission_read(draft, db_session)

        # answered_count: number of non-None answer entries in the merged map
        result.answered_count = sum(1 for v in merged_answers.values() if v is not None)

        # total_items for the assessment
        total_items = db_session.exec(select(AssessmentItem).where(AssessmentItem.assessment_id == assessment.id)).all()
        result.total_items = len(total_items)

        # time_remaining_seconds: computed from policy time limit and started_at
        policy = _get_policy_for_assessment(assessment, db_session)
        if policy is not None and policy.time_limit_seconds and draft.started_at:
            now = datetime.now(UTC)
            expires_at = draft.started_at.replace(tzinfo=UTC) + timedelta(seconds=policy.time_limit_seconds)
            remaining = int((expires_at - now).total_seconds())
            result.time_remaining_seconds = max(0, remaining)

        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "ASSESSMENT_SUPPORT_ALERT save_assessment_draft failed assessment_uuid=%s activity_uuid=%s user_id=%s",
            assessment.assessment_uuid,
            activity.activity_uuid,
            current_user.id,
        )
        raise


async def submit_assessment(
    assessment_uuid: str,
    payload: AssessmentDraftPatch | None,
    current_user: PublicUser,
    db_session: Session,
    *,
    violation_count: int = 0,
    if_match: str | None = None,
    auto_submit: bool = False,
) -> StudentSubmissionRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    activity_id = require_persisted_id(activity.id, model_name="Activity")
    is_teacher_preview = _is_teacher_preview_user(current_user, activity, course, db_session)

    if auto_submit:
        # Bypasses the action-allowed checks, ignores any post-expiry payload modifications,
        # and submits whatever answers are already saved in the database.
        _require_submit_access(current_user, activity, course, db_session)
        draft = _get_or_create_submission_draft(
            assessment=assessment,
            activity=activity,
            current_user=current_user,
            db_session=db_session,
        )
        _enforce_draft_version(draft, if_match)

        # Lock metadata with expiration reason
        metadata = draft.metadata_json or {}
        metadata["auto_submit_reason"] = "TIME_EXPIRED"
        metadata["auto_submitted_at"] = datetime.now(UTC).isoformat()
        draft.metadata_json = metadata
        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)

        answers_payload = draft.answers_json
        submission_uuid = draft.submission_uuid
        skip_constraints = True
    else:
        _assert_attempt_action_allowed(
            action="submit",
            assessment=assessment,
            activity=activity,
            course=course,
            current_user=current_user,
            db_session=db_session,
        )

        if payload is not None:
            saved_draft = await save_assessment_draft(
                assessment_uuid,
                payload,
                current_user,
                db_session,
                if_match=if_match,
                enforce_throttle=False,
            )
            answers_payload = saved_draft.answers_json
            submission_uuid = saved_draft.submission_uuid
        else:
            draft = _get_or_create_submission_draft(
                assessment=assessment,
                activity=activity,
                current_user=current_user,
                db_session=db_session,
            )
            _enforce_draft_version(draft, if_match)
            answers_payload = draft.answers_json
            submission_uuid = draft.submission_uuid
        skip_constraints = is_teacher_preview

    try:
        settings = load_activity_settings(activity_id, AssessmentType(assessment.kind), db_session)
        result = await submit_assessment_pipeline(
            activity_id=activity_id,
            assessment_type=AssessmentType(assessment.kind),
            answers_payload=answers_payload,
            settings=settings,
            current_user=current_user,
            db_session=db_session,
            violation_count=violation_count,
            submission_uuid=submission_uuid,
            skip_permission=is_teacher_preview or auto_submit,
            skip_policy_constraints=skip_constraints,
        )
        submission = db_session.exec(
            select(Submission).where(Submission.submission_uuid == result.submission_uuid)
        ).first()
        if submission is None:
            raise HTTPException(status_code=500, detail="Отправка не была сохранена")

        # Phase 3: Snapshot items and policy at submit time
        _snapshot_submission(submission, assessment, db_session)

        return _build_student_submission_read(submission, db_session)
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "ASSESSMENT_SUPPORT_ALERT submit_assessment failed assessment_uuid=%s activity_uuid=%s user_id=%s",
            assessment.assessment_uuid,
            activity.activity_uuid,
            current_user.id,
        )
        raise


async def get_attempt_state(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> AssessmentAttemptProjection:
    """Return the canonical attempt state for the current user.

    This is the authoritative single-call contract for student UI rendering.
    Every start/save/submit action should be driven from the flags returned here.
    """
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_submit_access(current_user, activity, course, db_session)

    state = _build_attempt_state(assessment, activity, current_user, db_session)
    active_submission = state["active_submission"]
    submission_status = SubmissionStatus(active_submission.status) if active_submission is not None else None
    return AssessmentAttemptProjection(
        assessment_uuid=assessment.assessment_uuid,
        submission_uuid=active_submission.submission_uuid if active_submission else None,
        submission_status=submission_status.value if submission_status else None,
        release_state=_release_state_for_submission(active_submission, db_session),
        can_edit=bool(state["can_edit"]),
        can_save_draft=bool(state["can_save_draft"]),
        can_submit=bool(state["can_submit"]),
        can_start=bool(state["can_start"]),
        can_continue=bool(state["can_continue"]),
        can_view_result=bool(state["can_view_result"]),
        can_start_revision=bool(state["can_start_revision"]),
        recommended_action=state["recommended_action"],
        primary_button_label_key=str(state["primary_button_label_key"]),
        is_returned_for_revision=submission_status == SubmissionStatus.RETURNED,
        is_result_visible=_is_result_visible(active_submission, db_session),
        score=_score_projection_from_submission(active_submission, db_session),
        disabled_action_reasons=state["disabled_action_reasons"],
        effective_policy=state["effective_policy"],
        server_now=state["server_now"],
        started_at=state["started_at"],
        timer_started_at=state["timer_started_at"],
        timer_expires_at=state["timer_expires_at"],
        available_at=state["available_at"],
        closes_at=state["closes_at"],
        due_at=state["due_at"],
        time_remaining_seconds=state["time_remaining_seconds"],
        content_version=_content_version(assessment),
        policy_version=_policy_version(_get_policy_for_assessment(assessment, db_session)),
    )


# ── Phase 2: Policy presets ───────────────────────────────────────────────────


async def save_grading_draft(
    assessment_uuid: str,
    submission_uuid: str,
    payload: GradingDraftSave,
    current_user: PublicUser,
    db_session: Session,
    *,
    if_match: str | None = None,
) -> TeacherSubmissionRead:
    """Save an item-level grading draft for a submission.

    When override_score is False, final_score is calculated as the sum of
    item scores divided by the sum of max_scores. When override_score is True,
    the caller-provided final_score is stored directly with override_reason.
    """
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_grade(current_user, course, db_session)
    activity_id = require_persisted_id(activity.id, model_name="Activity")

    submission = _get_assessment_submission_or_404(
        activity_id=activity_id,
        submission_uuid=submission_uuid,
        db_session=db_session,
    )

    # Build item-level grade breakdown
    items = {item.item_uuid: item for item in _get_items(assessment, db_session)}
    total_earned = 0.0
    total_possible = 0.0
    item_feedback_list = []

    for entry in payload.item_grades:
        item = items.get(entry.item_uuid)
        if item is None:
            continue
        score = entry.score if entry.score is not None else 0.0
        max_score = item.max_score if item.max_score > 0 else 1.0
        total_earned += score
        total_possible += max_score

        from src.db.grading.submissions import ItemFeedback, TeacherGradeInput
        item_feedback_list.append(
            ItemFeedback(
                item_id=entry.item_uuid,
                score=score,
                feedback=entry.feedback or "",
            )
        )

    # Вычислить итоговый балл (процент 0–100)
    if payload.override_score and payload.final_score is not None:
        calculated_score = payload.final_score
    elif total_possible > 0:
        calculated_score = round((total_earned / total_possible) * 100, 2)
    else:
        calculated_score = 0.0

    # Pass the raw calculated score — _save_teacher_grade applies the late
    # penalty itself. Do NOT pre-apply the penalty here or it will be doubled.
    # Build TeacherGradeInput for the existing grade save pipeline

    grade_input = TeacherGradeInput(
        final_score=calculated_score,
        feedback=payload.overall_feedback,
        status=payload.status,
        item_feedback=item_feedback_list,
    )

    expected_version = _parse_if_match_version(if_match)
    saved = await _save_teacher_grade(
        submission=submission,
        grade_input=grade_input,
        submission_uuid=submission_uuid,
        current_user=current_user,
        db_session=db_session,
        expected_version=expected_version,
    )
    refreshed = db_session.exec(select(Submission).where(Submission.submission_uuid == saved.submission_uuid)).first()
    if refreshed is None:
        raise HTTPException(status_code=500, detail="Отправка не была сохранена")
    return _build_teacher_submission_read(refreshed, assessment, db_session)


# ── Phase 5: Code challenge runtime ───────────────────────────────────────────


async def run_code_item(
    assessment_uuid: str,
    item_uuid: str,
    payload: CodeRunRequest,
    current_user: PublicUser,
    db_session: Session,
) -> CodeRunResponse:
    """Execute code against the visible test cases for an assessment item.

    This endpoint stores the visible run result in the active draft's metadata
    but does NOT affect the final submission grade. Hidden tests are only
    evaluated at final submit time.
    """
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_submit_access(current_user, activity, course, db_session)

    item = _get_item_or_404(assessment, item_uuid, db_session)
    if item.kind != ItemKind.CODE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Этот эндпоинт доступен только для элементов типа CODE",
        )

    body = ITEM_BODY_ADAPTER.validate_python(item.body_json)
    if body.kind != "CODE":
        raise HTTPException(status_code=400, detail="Тело элемента не является типом CODE")

    # Validate language
    if payload.language not in body.languages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "LANGUAGE_NOT_ALLOWED",
                "message": f"Язык {payload.language} не разрешен для этого элемента.",
                "allowed_languages": body.languages,
            },
        )

    # Collect visible test cases
    visible_tests = [t for t in body.tests if t.is_visible]

    service = get_code_execution_service()
    purpose = CodeRunPurpose.CUSTOM if payload.custom_input is not None else CodeRunPurpose.VISIBLE
    result = await service.run(
        db_session=db_session,
        assessment_uuid=assessment_uuid,
        item_uuid=item_uuid,
        user_id=current_user.id,
        purpose=purpose,
        language_id=payload.language,
        source_code=payload.source,
        test_cases=visible_tests,
        custom_input=payload.custom_input,
        idempotency_key=payload.idempotency_key,
        time_limit_seconds=body.time_limit_seconds,
        memory_limit_mb=body.memory_limit_mb,
    )
    if result.status == CodeRunStatus.DEGRADED:
        logger.warning(
            "ASSESSMENT_SUPPORT_ALERT Judge0 degraded assessment_uuid=%s item_uuid=%s: %s",
            assessment_uuid,
            item_uuid,
            result.error_message,
        )
        return CodeRunResponse(
            run_id=result.run_uuid,
            status=result.status.value,
            error_message=result.error_message,
            is_retryable=True,
        )

    # Persist latest visible/custom run in draft metadata for recovery and diagnostics.
    if draft := db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity.id,
            Submission.user_id == current_user.id,
            Submission.status == SubmissionStatus.DRAFT,
        )
    ).first():
        from src.db.grading.submissions import CodeRunRecord, merge_submission_metadata

        record = CodeRunRecord(
            run_id=result.run_uuid,
            language_id=payload.language,
            status=result.status.value,
            passed=result.passed,
            total=result.total,
            score=result.score,
            stdout=result.stdout,
            stderr=result.stderr,
            compile_output=result.compile_output,
            time=result.time,
            memory=result.memory,
            details=result.grading_details(),
            created_at=datetime.now(UTC),
        )
        draft.metadata_json = merge_submission_metadata(
            draft.metadata_json,
            latest_run=record.model_dump(mode="json"),
        )
        db_session.add(draft)
        db_session.commit()

    return CodeRunResponse(
        run_id=result.run_uuid,
        status=result.status.value,
        passed=result.passed,
        total=result.total,
        score=result.score,
        stdout=result.stdout,
        stderr=result.stderr,
        compile_output=result.compile_output,
        time=result.time,
        memory=result.memory,
        visible_results=result.visible_response_results(),
    )


async def get_code_item_run(
    assessment_uuid: str,
    item_uuid: str,
    run_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> CodeRunResponse:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_submit_access(current_user, activity, course, db_session)
    item = _get_item_or_404(assessment, item_uuid, db_session)
    if item.kind != ItemKind.CODE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Этот эндпоинт доступен только для элементов типа CODE",
        )
    result = get_code_execution_service().get_run(
        db_session=db_session,
        run_uuid=run_uuid,
        user_id=current_user.id,
        item_uuid=item_uuid,
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запуск кода не найден")
    return CodeRunResponse(
        run_id=result.run_uuid,
        status=result.status.value,
        passed=result.passed,
        total=result.total,
        score=result.score,
        stdout=result.stdout,
        stderr=result.stderr,
        compile_output=result.compile_output,
        time=result.time,
        memory=result.memory,
        visible_results=result.visible_response_results(),
        error_message=result.error_message,
        is_retryable=result.status == CodeRunStatus.DEGRADED,
    )


async def validate_code_challenge_service(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, object]:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_submit_access(current_user, activity, course, db_session)

    from src.db.assessments import AssessmentItem, ItemKind

    item = db_session.exec(
        select(AssessmentItem)
        .join(Assessment, col(Assessment.id) == AssessmentItem.assessment_id)
        .where(
            Assessment.assessment_uuid == assessment_uuid,
            AssessmentItem.kind == ItemKind.CODE,
        )
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Элемент типа CODE не найден")

    body = ITEM_BODY_ADAPTER.validate_python(item.body_json)
    if body.kind != "CODE":
        raise HTTPException(status_code=400, detail="Тело элемента не является типом CODE")

    all_tests = body.tests
    service = get_code_execution_service()

    results_by_lang: dict[int, dict[str, object]] = {}
    from src.db.code_execution import CodeRunPurpose, CodeRunStatus

    for lang_id in body.languages:
        ref_sol = (body.reference_solutions or {}).get(str(lang_id))
        if not ref_sol:
            results_by_lang[lang_id] = {
                "ok": False,
                "status": "MISSING_SOLUTION",
                "message": "Эталонное решение не определено для этого языка.",
            }
            continue

        try:
            result = await service.run(
                db_session=db_session,
                assessment_uuid=assessment_uuid,
                item_uuid=item.item_uuid,
                user_id=current_user.id,
                purpose=CodeRunPurpose.REFERENCE_CHECK,
                language_id=lang_id,
                source_code=ref_sol,
                test_cases=all_tests,
                time_limit_seconds=body.time_limit_seconds,
                memory_limit_mb=body.memory_limit_mb,
            )

            results_by_lang[lang_id] = {
                "ok": result.status == CodeRunStatus.ACCEPTED,
                "status": result.status.value,
                "passed": result.passed,
                "total": result.total,
                "score": result.score,
                "compile_output": result.compile_output,
                "details": [
                    {
                        "test_id": d.test_id,
                        "passed": d.passed,
                        "status_description": d.status_description,
                        "time": d.time,
                        "memory": d.memory,
                    }
                    for d in result.details
                ],
            }
        except Exception as exc:
            results_by_lang[lang_id] = {
                "ok": False,
                "status": "ERROR",
                "message": str(exc),
            }

    return {"results": results_by_lang}


# ── Readiness ─────────────────────────────────────────────────────────────────
