from __future__ import annotations

import json
import re
from typing import cast
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, col, select

from config.config import get_settings
from src.db.ai_course_analysis import AICourseAnalysis
from src.db.ai_lecture_review import AILectureReview
from src.db.ai_qa_thread import AIQAMessage
from src.db.ai_remediation import AIRemediationSession
from src.db.ai_runtime import AIArtifactRecord, AIEvent, AIEvidence, AIRun, AIRunStatus, AIThread, AIThreadRole, utc_now
from src.db.ai_submission_analysis import AISubmissionAnalysis
from src.db.courses.activities import Activity
from src.db.courses.courses import Course
from src.db.grading.submissions import Submission
from src.db.users import PublicUser, User
from src.services.ai.agents.course_analyst import analyze_course
from src.services.ai.agents.course_qa import answer_course_question
from src.services.ai.agents.lecture_author import critique_lecture
from src.services.ai.agents.remediation_generator import generate_remediation
from src.services.ai.agents.study_companion import StudyMode, answer_study_prompt
from src.services.ai.agents.submission_analyst import analyze_submission
from src.services.ai.context.course_context import assemble_course_context_bundle, assemble_submission_context_bundle
from src.services.ai.context.sources import AIContextSource, render_context_bundle, validate_citations
from src.services.ai.policy import (
    derive_course_ai_role,
    require_ai_course_read,
    require_ai_course_update,
    require_ai_submission_access,
)
from src.services.ai.providers import ModelProvider
from src.services.ai.schemas import CourseQAAnswer, SubmissionAnalysisReport
from src.services.ai.token_budget import TokenBudgetExceeded, TokenBudgetService
from src.services.courses.courses import _get_course_by_uuid  # pyright: ignore[reportPrivateUsage]
from src.types import JsonObject

SECRET_PATTERNS = (
    re.compile(r"\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b", re.IGNORECASE),
)


class AIRunCancelled(RuntimeError):
    pass


def _new_uuid(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _redact_text(value: str) -> str:
    redacted = value
    for pattern in SECRET_PATTERNS:
        redacted = pattern.sub("[REDACTED_SECRET]", redacted)
    return redacted


def _redact_json(value: object) -> object:
    if isinstance(value, str):
        return _redact_text(value)
    if isinstance(value, list):
        return [_redact_json(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _redact_json(item) for key, item in value.items()}
    return value


def _safe_artifact(value: JsonObject) -> JsonObject:
    return _redact_json(value)  # type: ignore[return-value]


def _safe_citations(citations: list[JsonObject]) -> list[JsonObject]:
    return _redact_json(citations)  # type: ignore[return-value]


def _settings_provider() -> tuple[ModelProvider, TokenBudgetService]:
    config = get_settings().integrations.ai
    return ModelProvider(config), TokenBudgetService(config)


def _require_enabled(feature_flag: str) -> None:
    config = get_settings().integrations.ai
    if not config.ai_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Функция ИИ отключена",
        )
    if not bool(getattr(config, feature_flag)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Функция ИИ '{feature_flag}' отключена",
        )


def _course_or_404(db_session: Session, course_uuid: str) -> Course:
    course = _get_course_by_uuid(db_session, course_uuid)
    if course is None or course.id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Курс не найден")
    return course


def _submission_or_404(db_session: Session, submission_uuid: str) -> Submission:
    submission = db_session.exec(select(Submission).where(Submission.submission_uuid == submission_uuid)).first()
    if submission is None or submission.id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Решение не найдено")
    return submission


def _activity_for_submission(db_session: Session, submission: Submission) -> Activity | None:
    return db_session.get(Activity, submission.activity_id)


def _require_course_update(db_session: Session, course: Course, user: PublicUser) -> None:
    require_ai_course_update(db_session, course, user)


def _create_run(
    db_session: Session,
    *,
    user: PublicUser,
    role: str,
    kind: str,
    course_id: int | None = None,
    activity_id: int | None = None,
    metadata: JsonObject | None = None,
    queued: bool = False,
) -> AIRun:
    thread = AIThread(
        thread_uuid=_new_uuid("thread"),
        user_id=user.id,
        role=role,
        course_id=course_id,
        activity_id=activity_id,
        title=kind.replace("_", " ").title(),
    )
    db_session.add(thread)
    db_session.flush()
    assert thread.id is not None
    run = AIRun(
        run_uuid=_new_uuid("run"),
        thread_id=thread.id,
        status=AIRunStatus.QUEUED.value if queued else AIRunStatus.RUNNING.value,
        run_metadata={
            "kind": kind,
            "thread_uuid": thread.thread_uuid,
            "triggered_by_user_id": str(user.id),
            **(metadata or {}),
        },
    )
    db_session.add(run)
    db_session.flush()
    if queued:
        _emit_run_event(db_session, run, "queued", {"message": "AI run queued", "state": "queued"})
    else:
        _emit_run_event(db_session, run, "running", {"message": "AI run started", "state": "running"})
    return run


def _mark_run_running(db_session: Session, run: AIRun) -> None:
    _ensure_run_not_cancelled(db_session, run)
    if run.status == AIRunStatus.RUNNING.value:
        return
    run.status = AIRunStatus.RUNNING.value
    run.started_at = utc_now()
    run.completed_at = None
    run.error_code = None
    db_session.add(run)
    _emit_run_event(db_session, run, "running", {"message": "AI run started", "state": "running"})


def _ensure_run_not_cancelled(db_session: Session, run: AIRun) -> None:
    db_session.refresh(run)
    if run.status == AIRunStatus.ABORTED.value:
        raise AIRunCancelled("AI run was cancelled")


def _emit_run_event(db_session: Session, run: AIRun, event_type: str, payload: JsonObject | None = None) -> None:
    assert run.id is not None
    sequence = db_session.exec(
        select(func.coalesce(func.max(AIEvent.sequence), 0)).where(AIEvent.run_id == run.id)
    ).one()
    db_session.add(
        AIEvent(
            run_id=run.id,
            event_id=_new_uuid("event"),
            event_type=event_type,
            sequence=int(sequence or 0) + 1,
            payload_json=payload or {},
        )
    )


def _finish_run(
    db_session: Session,
    run: AIRun,
    *,
    model_name: str,
    kind: str,
    artifact: JsonObject,
    citations: list[JsonObject],
    input_tokens: int,
    context_sources: list[AIContextSource] | None = None,
) -> list[JsonObject]:
    artifact = _safe_artifact(artifact)
    citations = _safe_citations(citations)
    _ensure_run_not_cancelled(db_session, run)
    validation = validate_citations(citations, context_sources or [])
    trusted_citations = validation.valid_citations if context_sources is not None else citations
    _emit_run_event(
        db_session,
        run,
        "saving_artifact",
        {"message": "Saving AI artifact", "state": "checking_evidence"},
    )
    run.run_metadata = {
        **dict(run.run_metadata or {}),
        "citation_validation": validation.metadata if context_sources is not None else {"validation": "not_applicable"},
    }
    run.status = AIRunStatus.FINISHED.value
    run.model_name = model_name
    run.input_tokens = input_tokens
    run.output_tokens = TokenBudgetService(get_settings().integrations.ai).estimate_tokens(
        json.dumps(artifact, ensure_ascii=False),
        model_name,
    )
    run.completed_at = utc_now()
    if run.started_at and run.completed_at:
        run.duration_ms = int((run.completed_at - run.started_at).total_seconds() * 1000)
    db_session.add(run)
    db_session.flush()
    assert run.id is not None
    artifact_record = AIArtifactRecord(
        artifact_uuid=_new_uuid("artifact"),
        run_id=run.id,
        kind=kind,
        content_json=artifact,
        final=True,
    )
    db_session.add(artifact_record)
    db_session.flush()
    for index, citation in enumerate(trusted_citations):
        db_session.add(
            AIEvidence(
                run_id=run.id,
                artifact_id=artifact_record.id,
                citation_id=str(citation.get("citation_id") or f"citation-{index + 1}"),
                label=str(citation.get("label") or "AI evidence"),
                source_type=str(citation.get("source_type") or "unknown"),
                excerpt=str(citation.get("excerpt") or ""),
                score=float(citation.get("confidence") or 0.75),
                evidence_metadata={"source_uuid": citation.get("source_uuid")},
            )
        )
    _emit_run_event(
        db_session,
        run,
        "finished",
        {
            "message": "AI run completed",
            "state": "complete",
            "model_name": model_name,
            "input_tokens": input_tokens,
            "citations_valid": len(trusted_citations),
            "citations_invalid": len(validation.invalid_citations) if context_sources is not None else 0,
        },
    )
    return trusted_citations


def _emit_execution_events(db_session: Session, run: AIRun, *, source_count: int, input_tokens: int) -> None:
    _emit_run_event(
        db_session,
        run,
        "collecting_context",
        {"message": "Context collected", "state": "collecting_context", "source_count": source_count},
    )
    _emit_run_event(
        db_session,
        run,
        "budget_checked",
        {"message": "Token budget checked", "state": "running", "input_tokens": input_tokens},
    )
    _emit_run_event(
        db_session,
        run,
        "model_started",
        {"message": "Model request started", "state": "running"},
    )


def _emit_validation_event(db_session: Session, run: AIRun) -> None:
    _emit_run_event(
        db_session,
        run,
        "validating_output",
        {"message": "Validating AI output and citations", "state": "checking_evidence"},
    )


def _fail_run(db_session: Session, run: AIRun, error_code: str) -> None:
    db_session.refresh(run)
    if run.status == AIRunStatus.ABORTED.value:
        return
    run.status = AIRunStatus.ERROR.value
    run.error_code = error_code
    run.completed_at = utc_now()
    if run.started_at and run.completed_at:
        run.duration_ms = int((run.completed_at - run.started_at).total_seconds() * 1000)
    db_session.add(run)
    _emit_run_event(db_session, run, "failed", {"message": error_code, "state": "failed", "error_code": error_code})


def _assert_budget(
    token_budget: TokenBudgetService,
    db_session: Session,
    user: PublicUser,
    prompt: str,
    *,
    remediation: bool = False,
) -> int:
    try:
        return token_budget.assert_request_budget(
            user_id=user.id,
            prompt=prompt,
            db_session=db_session,
            remediation=remediation,
        )
    except TokenBudgetExceeded as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc


async def _enqueue_run(run: AIRun) -> None:
    from src.worker.tasks.ai import execute_ai_run_task

    await execute_ai_run_task.kiq(run.run_uuid)


def _public_user_for_run(db_session: Session, run: AIRun) -> PublicUser:
    user_id = int(str(run.run_metadata.get("triggered_by_user_id") or "0"))
    user = db_session.get(User, user_id)
    if user is None:
        msg = f"AI run user not found: {user_id}"
        raise RuntimeError(msg)
    return PublicUser.model_validate(user)


async def execute_queued_ai_run(db_session: Session, run_uuid: str) -> None:
    run = db_session.exec(select(AIRun).where(AIRun.run_uuid == run_uuid)).first()
    if run is None:
        msg = f"AI run not found: {run_uuid}"
        raise RuntimeError(msg)
    if run.status in {AIRunStatus.FINISHED.value, AIRunStatus.ABORTED.value}:
        return
    metadata = dict(run.run_metadata or {})
    kind = str(metadata.get("kind") or "")
    user = _public_user_for_run(db_session, run)
    try:
        if kind == "course_analysis":
            await run_course_analysis(
                db_session,
                str(metadata["course_uuid"]),
                user,
                str(metadata.get("language") or "auto"),
                run=run,
            )
        elif kind == "submission_analysis":
            await run_submission_analysis(
                db_session,
                str(metadata["submission_uuid"]),
                user,
                str(metadata.get("language") or "auto"),
                run=run,
            )
        elif kind == "remediation":
            await run_remediation_generation(
                db_session,
                str(metadata["submission_uuid"]),
                user,
                gate_mode=bool(metadata.get("gate_mode")),
                language=str(metadata.get("language") or "auto"),
                run=run,
            )
        elif kind == "study_companion":
            await run_study_companion(
                db_session,
                str(metadata["course_uuid"]),
                user,
                question=str(metadata.get("question") or ""),
                mode=cast("StudyMode", str(metadata.get("mode") or "explain")),
                language=str(metadata.get("language") or "auto"),
                run=run,
            )
        elif kind == "lecture_review":
            await run_lecture_review(
                db_session,
                str(metadata["course_uuid"]),
                user,
                activity_uuid=cast("str | None", metadata.get("activity_uuid")),
                language=str(metadata.get("language") or "auto"),
                run=run,
            )
        elif kind == "course_qa":
            await ask_course_question(
                db_session,
                str(metadata["course_uuid"]),
                user,
                question=str(metadata.get("question") or ""),
                thread_uuid=cast("str | None", metadata.get("thread_uuid")),
                language=str(metadata.get("language") or "auto"),
                run=run,
            )
        else:
            _fail_run(db_session, run, "AI_RUN_KIND_UNSUPPORTED")
            db_session.commit()
            msg = f"Unsupported AI run kind: {kind}"
            raise RuntimeError(msg)
    except AIRunCancelled:
        db_session.commit()
        return
    except Exception:
        if run.status != AIRunStatus.ERROR.value:
            _fail_run(db_session, run, f"{kind.upper() or 'AI'}_WORKER_FAILED")
            db_session.commit()
        raise


async def queue_course_analysis(db_session: Session, course_uuid: str, user: PublicUser, language: str) -> AIRun:
    _require_enabled("course_analysis_enabled")
    course = _course_or_404(db_session, course_uuid)
    _require_course_update(db_session, course, user)
    run = _create_run(
        db_session,
        user=user,
        role=AIThreadRole.TEACHER.value,
        kind="course_analysis",
        course_id=course.id,
        metadata={"course_uuid": course_uuid, "language": language},
        queued=True,
    )
    db_session.commit()
    db_session.refresh(run)
    await _enqueue_run(run)
    return run


async def queue_submission_analysis(
    db_session: Session, submission_uuid: str, user: PublicUser, language: str
) -> AIRun:
    _require_enabled("submission_analysis_enabled")
    submission = _submission_or_404(db_session, submission_uuid)
    require_ai_submission_access(db_session, submission, user)
    activity = _activity_for_submission(db_session, submission)
    run = _create_run(
        db_session,
        user=user,
        role=AIThreadRole.TEACHER.value if user.id != submission.user_id else AIThreadRole.STUDENT.value,
        kind="submission_analysis",
        activity_id=activity.id if activity else None,
        metadata={"submission_uuid": submission_uuid, "language": language},
        queued=True,
    )
    db_session.commit()
    db_session.refresh(run)
    await _enqueue_run(run)
    return run


async def queue_remediation_generation(
    db_session: Session,
    submission_uuid: str,
    user: PublicUser,
    *,
    gate_mode: bool,
    language: str,
) -> AIRun:
    _require_enabled("remediation_enabled")
    submission = _submission_or_404(db_session, submission_uuid)
    require_ai_submission_access(db_session, submission, user)
    run = _create_run(
        db_session,
        user=user,
        role=AIThreadRole.TEACHER.value if user.id != submission.user_id else AIThreadRole.STUDENT.value,
        kind="remediation",
        activity_id=submission.activity_id,
        metadata={"submission_uuid": submission_uuid, "gate_mode": gate_mode, "language": language},
        queued=True,
    )
    db_session.commit()
    db_session.refresh(run)
    await _enqueue_run(run)
    return run


async def queue_study_companion(
    db_session: Session,
    course_uuid: str,
    user: PublicUser,
    *,
    question: str,
    mode: StudyMode,
    language: str,
) -> AIRun:
    _require_enabled("study_companion_enabled")
    course = _course_or_404(db_session, course_uuid)
    require_ai_course_read(db_session, course, user)
    run = _create_run(
        db_session,
        user=user,
        role=AIThreadRole.STUDENT.value,
        kind="study_companion",
        course_id=course.id,
        metadata={"course_uuid": course_uuid, "question": question, "mode": str(mode), "language": language},
        queued=True,
    )
    db_session.commit()
    db_session.refresh(run)
    await _enqueue_run(run)
    return run


async def queue_lecture_review(
    db_session: Session,
    course_uuid: str,
    user: PublicUser,
    *,
    activity_uuid: str | None,
    language: str,
) -> AIRun:
    _require_enabled("lecture_authoring_enabled")
    course = _course_or_404(db_session, course_uuid)
    _require_course_update(db_session, course, user)
    activity = (
        db_session.exec(
            select(Activity).where(Activity.activity_uuid == activity_uuid, Activity.course_id == course.id)
        ).first()
        if activity_uuid
        else None
    )
    run = _create_run(
        db_session,
        user=user,
        role=AIThreadRole.TEACHER.value,
        kind="lecture_review",
        course_id=course.id,
        activity_id=activity.id if activity else None,
        metadata={"course_uuid": course_uuid, "activity_uuid": activity_uuid, "language": language},
        queued=True,
    )
    db_session.commit()
    db_session.refresh(run)
    await _enqueue_run(run)
    return run


async def queue_course_question(
    db_session: Session,
    course_uuid: str,
    user: PublicUser,
    *,
    question: str,
    thread_uuid: str | None,
    language: str,
) -> AIRun:
    _require_enabled("course_qa_enabled")
    course = _course_or_404(db_session, course_uuid)
    role = derive_course_ai_role(db_session, course, user)
    run = _create_run(
        db_session,
        user=user,
        role=role,
        kind="course_qa",
        course_id=course.id,
        metadata={
            "course_uuid": course_uuid,
            "question": question,
            **({"thread_uuid": thread_uuid} if thread_uuid else {}),
            "language": language,
        },
        queued=True,
    )
    db_session.commit()
    db_session.refresh(run)
    await _enqueue_run(run)
    return run


async def run_course_analysis(
    db_session: Session, course_uuid: str, user: PublicUser, language: str, *, run: AIRun | None = None
) -> AICourseAnalysis:
    _require_enabled("course_analysis_enabled")
    course = _course_or_404(db_session, course_uuid)
    _require_course_update(db_session, course, user)
    provider, token_budget = _settings_provider()
    context_bundle = assemble_course_context_bundle(db_session, course, include_unpublished=True)
    context = render_context_bundle(context_bundle)
    input_tokens = _assert_budget(token_budget, db_session, user, context)
    if run is None:
        run = _create_run(
            db_session,
            user=user,
            role=AIThreadRole.TEACHER.value,
            kind="course_analysis",
            course_id=course.id,
            metadata={
                "course_uuid": course.course_uuid,
                "language": language,
                "context_source_count": len(context_bundle.sources),
            },
        )
    else:
        _mark_run_running(db_session, run)
    try:
        _emit_execution_events(db_session, run, source_count=len(context_bundle.sources), input_tokens=input_tokens)
        report, model_name = await analyze_course(provider, context, language=language, locale=user.locale)
        _emit_validation_event(db_session, run)
        artifact = _safe_artifact(report.model_dump(mode="json"))
        citations = _safe_citations([citation.model_dump(mode="json") for citation in report.citations])
        trusted_citations = _finish_run(
            db_session,
            run,
            model_name=model_name,
            kind="course_analysis",
            artifact=artifact,
            citations=citations,
            input_tokens=input_tokens,
            context_sources=context_bundle.sources,
        )
        assert run.id is not None
        analysis = AICourseAnalysis(
            analysis_uuid=_new_uuid("course_analysis"),
            course_id=course.id,
            run_id=run.id,
            triggered_by_user_id=user.id,
            status="needs_human_review",
            language=report.language,
            public_score=report.public_score,
            report_json=artifact,
            evidence_json={"citations": trusted_citations},
            model_name=model_name,
        )
        db_session.add(analysis)
        db_session.commit()
        db_session.refresh(analysis)
        return analysis
    except Exception:
        _fail_run(db_session, run, "COURSE_ANALYSIS_FAILED")
        db_session.commit()
        raise


async def run_submission_analysis(
    db_session: Session,
    submission_uuid: str,
    user: PublicUser,
    language: str,
    *,
    run: AIRun | None = None,
) -> AISubmissionAnalysis:
    _require_enabled("submission_analysis_enabled")
    submission = _submission_or_404(db_session, submission_uuid)
    require_ai_submission_access(db_session, submission, user)
    provider, token_budget = _settings_provider()
    context_bundle, metadata = assemble_submission_context_bundle(db_session, submission)
    context = render_context_bundle(context_bundle)
    input_tokens = _assert_budget(token_budget, db_session, user, context)
    activity = _activity_for_submission(db_session, submission)
    if run is None:
        run = _create_run(
            db_session,
            user=user,
            role=AIThreadRole.TEACHER.value if user.id != submission.user_id else AIThreadRole.STUDENT.value,
            kind="submission_analysis",
            activity_id=activity.id if activity else None,
            metadata={
                **metadata,
                "submission_uuid": submission_uuid,
                "language": language,
                "context_source_count": len(context_bundle.sources),
            },
        )
    else:
        _mark_run_running(db_session, run)
    try:
        _emit_execution_events(db_session, run, source_count=len(context_bundle.sources), input_tokens=input_tokens)
        report, model_name = await analyze_submission(provider, context, language=language, locale=user.locale)
        _emit_validation_event(db_session, run)
        artifact = _safe_artifact(report.model_dump(mode="json"))
        citations = _safe_citations([citation.model_dump(mode="json") for citation in report.citations])
        trusted_citations = _finish_run(
            db_session,
            run,
            model_name=model_name,
            kind="submission_analysis",
            artifact=artifact,
            citations=citations,
            input_tokens=input_tokens,
            context_sources=context_bundle.sources,
        )
        assert submission.id is not None
        assert run.id is not None
        analysis = AISubmissionAnalysis(
            analysis_uuid=_new_uuid("submission_analysis"),
            submission_id=submission.id,
            run_id=run.id,
            triggered_by_user_id=user.id,
            language=report.language,
            gap_count=len(report.knowledge_gaps),
            analysis_json=artifact,
            evidence_json={"citations": trusted_citations},
            model_name=model_name,
        )
        db_session.add(analysis)
        db_session.commit()
        db_session.refresh(analysis)
        return analysis
    except Exception:
        _fail_run(db_session, run, "SUBMISSION_ANALYSIS_FAILED")
        db_session.commit()
        raise


async def run_remediation_generation(
    db_session: Session,
    submission_uuid: str,
    user: PublicUser,
    *,
    gate_mode: bool,
    language: str,
    run: AIRun | None = None,
) -> AIRemediationSession:
    _require_enabled("remediation_enabled")
    submission = _submission_or_404(db_session, submission_uuid)
    require_ai_submission_access(db_session, submission, user)
    context_bundle, metadata = assemble_submission_context_bundle(db_session, submission)
    context = render_context_bundle(context_bundle)
    provider, token_budget = _settings_provider()
    input_tokens = _assert_budget(token_budget, db_session, user, context, remediation=True)
    latest_analysis = db_session.exec(
        select(AISubmissionAnalysis)
        .where(AISubmissionAnalysis.submission_id == submission.id)
        .order_by(col(AISubmissionAnalysis.created_at).desc())
    ).first()
    if latest_analysis is None:
        latest_analysis = await run_submission_analysis(db_session, submission_uuid, user, language)
    analysis_report = SubmissionAnalysisReport.model_validate(latest_analysis.analysis_json)
    if run is None:
        run = _create_run(
            db_session,
            user=user,
            role=AIThreadRole.TEACHER.value,
            kind="remediation",
            activity_id=submission.activity_id,
            metadata={
                **metadata,
                "submission_uuid": submission_uuid,
                "gate_mode": gate_mode,
                "language": language,
                "context_source_count": len(context_bundle.sources),
            },
        )
    else:
        _mark_run_running(db_session, run)
    try:
        _emit_execution_events(db_session, run, source_count=len(context_bundle.sources), input_tokens=input_tokens)
        bundle, model_name = await generate_remediation(
            provider, context, analysis_report, language=language, locale=user.locale
        )
        _emit_validation_event(db_session, run)
        artifact = _safe_artifact(bundle.model_dump(mode="json"))
        citations = _safe_citations([citation.model_dump(mode="json") for citation in bundle.citations])
        questions = _redact_json([question.model_dump(mode="json") for question in bundle.practice_questions])
        _finish_run(
            db_session,
            run,
            model_name=model_name,
            kind="remediation",
            artifact=artifact,
            citations=citations,
            input_tokens=input_tokens,
            context_sources=context_bundle.sources,
        )
        assert submission.id is not None
        assert run.id is not None
        session = AIRemediationSession(
            session_uuid=_new_uuid("remediation"),
            submission_id=submission.id,
            activity_id=submission.activity_id,
            student_user_id=submission.user_id,
            analysis_id=latest_analysis.id,
            run_id=run.id,
            gate_mode=gate_mode,
            language=bundle.language,
            lecture_json=artifact,
            test_json={"questions": questions},
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)
        return session
    except Exception:
        _fail_run(db_session, run, "REMEDIATION_FAILED")
        db_session.commit()
        raise


async def run_study_companion(
    db_session: Session,
    course_uuid: str,
    user: PublicUser,
    *,
    question: str,
    mode: StudyMode,
    language: str,
    run: AIRun | None = None,
) -> CourseQAAnswer | JsonObject:
    _require_enabled("study_companion_enabled")
    course = _course_or_404(db_session, course_uuid)
    require_ai_course_read(db_session, course, user)
    provider, token_budget = _settings_provider()
    context_bundle = assemble_course_context_bundle(db_session, course, include_unpublished=False)
    context = render_context_bundle(context_bundle)
    input_tokens = _assert_budget(token_budget, db_session, user, f"{question}\n{context}")
    if run is None:
        run = _create_run(
            db_session,
            user=user,
            role=AIThreadRole.STUDENT.value,
            kind="study_companion",
            course_id=course.id,
            metadata={
                "course_uuid": course_uuid,
                "question": question,
                "mode": str(mode),
                "language": language,
                "context_source_count": len(context_bundle.sources),
            },
        )
    else:
        _mark_run_running(db_session, run)
    try:
        _emit_execution_events(db_session, run, source_count=len(context_bundle.sources), input_tokens=input_tokens)
        answer, model_name = await answer_study_prompt(
            provider, context, question, mode=mode, language=language, locale=user.locale
        )
        _emit_validation_event(db_session, run)
        artifact = _safe_artifact(answer.model_dump(mode="json"))
        citations = _safe_citations([citation.model_dump(mode="json") for citation in answer.citations])
        _finish_run(
            db_session,
            run,
            model_name=model_name,
            kind="study_companion",
            artifact=artifact,
            citations=citations,
            input_tokens=input_tokens,
            context_sources=context_bundle.sources,
        )
        db_session.commit()
        return artifact
    except Exception:
        _fail_run(db_session, run, "STUDY_COMPANION_FAILED")
        db_session.commit()
        raise


async def run_lecture_review(
    db_session: Session,
    course_uuid: str,
    user: PublicUser,
    *,
    activity_uuid: str | None,
    language: str,
    run: AIRun | None = None,
) -> AILectureReview:
    _require_enabled("lecture_authoring_enabled")
    course = _course_or_404(db_session, course_uuid)
    _require_course_update(db_session, course, user)
    provider, token_budget = _settings_provider()
    context_bundle = assemble_course_context_bundle(db_session, course, include_unpublished=True)
    context = render_context_bundle(context_bundle)
    input_tokens = _assert_budget(token_budget, db_session, user, context)
    activity = (
        db_session.exec(
            select(Activity).where(Activity.activity_uuid == activity_uuid, Activity.course_id == course.id)
        ).first()
        if activity_uuid
        else None
    )
    if run is None:
        run = _create_run(
            db_session,
            user=user,
            role=AIThreadRole.TEACHER.value,
            kind="lecture_review",
            course_id=course.id,
            activity_id=activity.id if activity else None,
            metadata={
                "course_uuid": course_uuid,
                "activity_uuid": activity_uuid,
                "language": language,
                "context_source_count": len(context_bundle.sources),
            },
        )
    else:
        _mark_run_running(db_session, run)
    try:
        _emit_execution_events(db_session, run, source_count=len(context_bundle.sources), input_tokens=input_tokens)
        report, model_name = await critique_lecture(provider, context, language=language, locale=user.locale)
        _emit_validation_event(db_session, run)
        artifact = _safe_artifact(report.model_dump(mode="json"))
        citations = _safe_citations([citation.model_dump(mode="json") for citation in report.citations])
        _finish_run(
            db_session,
            run,
            model_name=model_name,
            kind="lecture_review",
            artifact=artifact,
            citations=citations,
            input_tokens=input_tokens,
            context_sources=context_bundle.sources,
        )
        assert run.id is not None
        review = AILectureReview(
            review_uuid=_new_uuid("lecture_review"),
            course_id=course.id,
            activity_id=activity.id if activity else None,
            run_id=run.id,
            triggered_by_user_id=user.id,
            language=report.language,
            suggestions_json=artifact,
        )
        db_session.add(review)
        db_session.commit()
        db_session.refresh(review)
        return review
    except Exception:
        _fail_run(db_session, run, "LECTURE_REVIEW_FAILED")
        db_session.commit()
        raise


async def ask_course_question(
    db_session: Session,
    course_uuid: str,
    user: PublicUser,
    *,
    question: str,
    thread_uuid: str | None,
    language: str,
    run: AIRun | None = None,
) -> tuple[AIThread, AIQAMessage, AIQAMessage]:
    _require_enabled("course_qa_enabled")
    course = _course_or_404(db_session, course_uuid)
    provider, token_budget = _settings_provider()
    role = derive_course_ai_role(db_session, course, user)
    include_unpublished = role in {AIThreadRole.TEACHER.value, AIThreadRole.AUTHOR.value, AIThreadRole.ADMIN.value}
    context_bundle = assemble_course_context_bundle(db_session, course, include_unpublished=include_unpublished)
    context = render_context_bundle(context_bundle)
    input_tokens = _assert_budget(token_budget, db_session, user, f"{question}\n{context}")

    thread = (
        db_session.exec(
            select(AIThread).where(AIThread.thread_uuid == thread_uuid, AIThread.user_id == user.id)
        ).first()
        if thread_uuid
        else None
    )
    if thread is None:
        thread = AIThread(
            thread_uuid=_new_uuid("thread"),
            user_id=user.id,
            role=role,
            course_id=course.id,
            title=question[:80],
        )
        db_session.add(thread)
        db_session.flush()
    assert thread.id is not None
    user_message = AIQAMessage(
        message_uuid=_new_uuid("msg"),
        thread_id=thread.id,
        course_id=course.id,
        user_id=user.id,
        role="user",
        content=question,
    )
    db_session.add(user_message)
    if run is None:
        run = _create_run(
            db_session,
            user=user,
            role=role,
            kind="course_qa",
            course_id=course.id,
            metadata={
                "course_uuid": course_uuid,
                "thread_uuid": thread.thread_uuid,
                "question": question,
                "language": language,
                "context_source_count": len(context_bundle.sources),
            },
        )
    else:
        _mark_run_running(db_session, run)
    try:
        _emit_execution_events(db_session, run, source_count=len(context_bundle.sources), input_tokens=input_tokens)
        answer, model_name = await answer_course_question(
            provider, context, question, role=role, language=language, locale=user.locale
        )
        _emit_validation_event(db_session, run)
        artifact = _safe_artifact(answer.model_dump(mode="json"))
        citations = _safe_citations([citation.model_dump(mode="json") for citation in answer.citations])
        trusted_citations = _finish_run(
            db_session,
            run,
            model_name=model_name,
            kind="course_qa",
            artifact=artifact,
            citations=citations,
            input_tokens=input_tokens,
            context_sources=context_bundle.sources,
        )
        assistant_message = AIQAMessage(
            message_uuid=_new_uuid("msg"),
            thread_id=thread.id,
            course_id=course.id,
            user_id=user.id,
            role="assistant",
            content=str(artifact.get("answer_markdown") or ""),
            confidence=answer.confidence,
            citations_json={"citations": trusted_citations},
            message_metadata={"model_name": model_name, "out_of_scope": answer.out_of_scope},
        )
        thread.updated_at = utc_now()
        db_session.add(assistant_message)
        db_session.add(thread)
        db_session.commit()
        db_session.refresh(thread)
        db_session.refresh(user_message)
        db_session.refresh(assistant_message)
        return thread, user_message, assistant_message
    except Exception:
        _fail_run(db_session, run, "COURSE_QA_FAILED")
        db_session.commit()
        raise


def publish_course_analysis(db_session: Session, analysis_uuid: str, user: PublicUser) -> AICourseAnalysis:
    analysis = db_session.exec(select(AICourseAnalysis).where(AICourseAnalysis.analysis_uuid == analysis_uuid)).first()
    if analysis is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Анализ не найден")
    course = db_session.get(Course, analysis.course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Курс не найден")
    _require_course_update(db_session, course, user)
    analysis.status = "published"
    analysis.published_at = utc_now()
    db_session.add(analysis)
    db_session.commit()
    db_session.refresh(analysis)
    return analysis


def active_remediation_gate(db_session: Session, *, user_id: int, activity_id: int) -> AIRemediationSession | None:
    return db_session.exec(
        select(AIRemediationSession).where(
            AIRemediationSession.student_user_id == user_id,
            AIRemediationSession.activity_id == activity_id,
            AIRemediationSession.gate_mode == True,  # noqa: E712
            col(AIRemediationSession.status).in_(["assigned", "in_progress", "failed"]),
        )
    ).first()
