from __future__ import annotations

import re
from uuid import uuid4

from fastapi import HTTPException, status
from sqlmodel import Session, col, select

from config.config import get_settings
from src.db.ai_course_analysis import AICourseAnalysis
from src.db.ai_lecture_review import AILectureReview
from src.db.ai_qa_thread import AIQAMessage
from src.db.ai_remediation import AIRemediationSession
from src.db.ai_runtime import AIArtifactRecord, AIEvidence, AIRun, AIRunStatus, AIThread, AIThreadRole, utc_now
from src.db.ai_submission_analysis import AISubmissionAnalysis
from src.db.courses.activities import Activity
from src.db.courses.courses import Course
from src.db.grading.submissions import Submission
from src.db.users import PublicUser
from src.security.rbac import PermissionChecker
from src.services.ai.agents.course_analyst import analyze_course
from src.services.ai.agents.course_qa import answer_course_question
from src.services.ai.agents.lecture_author import critique_lecture
from src.services.ai.agents.remediation_generator import generate_remediation
from src.services.ai.agents.study_companion import StudyMode, answer_study_prompt
from src.services.ai.agents.submission_analyst import analyze_submission
from src.services.ai.context.course_context import assemble_course_context, assemble_submission_context
from src.services.ai.providers import ModelProvider
from src.services.ai.schemas import CourseQAAnswer, SubmissionAnalysisReport
from src.services.ai.token_budget import TokenBudgetExceeded, TokenBudgetService
from src.services.courses.courses import _get_course_by_uuid  # pyright: ignore[reportPrivateUsage]
from src.types import JsonObject

SECRET_PATTERNS = (
    re.compile(r"\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b", re.IGNORECASE),
)


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
        return
    if not bool(getattr(config, feature_flag)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"AI feature '{feature_flag}' is disabled",
        )


def _course_or_404(db_session: Session, course_uuid: str) -> Course:
    course = _get_course_by_uuid(db_session, course_uuid)
    if course is None or course.id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


def _submission_or_404(db_session: Session, submission_uuid: str) -> Submission:
    submission = db_session.exec(select(Submission).where(Submission.submission_uuid == submission_uuid)).first()
    if submission is None or submission.id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    return submission


def _activity_for_submission(db_session: Session, submission: Submission) -> Activity | None:
    return db_session.get(Activity, submission.activity_id)


def _require_course_update(db_session: Session, course: Course, user: PublicUser) -> None:
    checker = PermissionChecker(db_session)
    if course.creator_id is not None and checker.check(user.id, "course:update", resource_owner_id=course.creator_id):
        return
    checker.require(user.id, "course:update", resource_owner_id=course.creator_id)


def _create_run(
    db_session: Session,
    *,
    user: PublicUser,
    role: str,
    kind: str,
    course_id: int | None = None,
    activity_id: int | None = None,
    metadata: JsonObject | None = None,
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
        status=AIRunStatus.RUNNING.value,
        run_metadata={
            "kind": kind,
            "triggered_by_user_id": str(user.id),
            **(metadata or {}),
        },
    )
    db_session.add(run)
    db_session.flush()
    return run


def _finish_run(
    db_session: Session,
    run: AIRun,
    *,
    model_name: str,
    kind: str,
    artifact: JsonObject,
    citations: list[JsonObject],
    input_tokens: int,
) -> None:
    artifact = _safe_artifact(artifact)
    citations = _safe_citations(citations)
    run.status = AIRunStatus.FINISHED.value
    run.model_name = model_name
    run.input_tokens = input_tokens
    run.completed_at = utc_now()
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
    for index, citation in enumerate(citations):
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


def _fail_run(db_session: Session, run: AIRun, error_code: str) -> None:
    run.status = AIRunStatus.ERROR.value
    run.error_code = error_code
    run.completed_at = utc_now()
    db_session.add(run)


def _assert_budget(token_budget: TokenBudgetService, db_session: Session, user: PublicUser, prompt: str) -> int:
    try:
        return token_budget.assert_request_budget(user_id=user.id, prompt=prompt, db_session=db_session)
    except TokenBudgetExceeded as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc


async def run_course_analysis(
    db_session: Session, course_uuid: str, user: PublicUser, language: str
) -> AICourseAnalysis:
    _require_enabled("course_analysis_enabled")
    course = _course_or_404(db_session, course_uuid)
    _require_course_update(db_session, course, user)
    provider, token_budget = _settings_provider()
    context = assemble_course_context(db_session, course, include_unpublished=True)
    input_tokens = _assert_budget(token_budget, db_session, user, context)
    run = _create_run(
        db_session, user=user, role=AIThreadRole.TEACHER.value, kind="course_analysis", course_id=course.id
    )
    try:
        report, model_name = await analyze_course(provider, context, language=language)
        artifact = _safe_artifact(report.model_dump(mode="json"))
        citations = _safe_citations([citation.model_dump(mode="json") for citation in report.citations])
        _finish_run(
            db_session,
            run,
            model_name=model_name,
            kind="course_analysis",
            artifact=artifact,
            citations=citations,
            input_tokens=input_tokens,
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
            evidence_json={"citations": citations},
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
) -> AISubmissionAnalysis:
    _require_enabled("submission_analysis_enabled")
    submission = _submission_or_404(db_session, submission_uuid)
    provider, token_budget = _settings_provider()
    context, metadata = assemble_submission_context(db_session, submission)
    input_tokens = _assert_budget(token_budget, db_session, user, context)
    activity = _activity_for_submission(db_session, submission)
    run = _create_run(
        db_session,
        user=user,
        role=AIThreadRole.TEACHER.value if user.id != submission.user_id else AIThreadRole.STUDENT.value,
        kind="submission_analysis",
        activity_id=activity.id if activity else None,
        metadata=metadata,
    )
    try:
        report, model_name = await analyze_submission(provider, context, language=language)
        artifact = _safe_artifact(report.model_dump(mode="json"))
        citations = _safe_citations([citation.model_dump(mode="json") for citation in report.citations])
        _finish_run(
            db_session,
            run,
            model_name=model_name,
            kind="submission_analysis",
            artifact=artifact,
            citations=citations,
            input_tokens=input_tokens,
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
            evidence_json={"citations": citations},
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
) -> AIRemediationSession:
    _require_enabled("remediation_enabled")
    submission = _submission_or_404(db_session, submission_uuid)
    context, metadata = assemble_submission_context(db_session, submission)
    provider, token_budget = _settings_provider()
    input_tokens = _assert_budget(token_budget, db_session, user, context)
    latest_analysis = db_session.exec(
        select(AISubmissionAnalysis)
        .where(AISubmissionAnalysis.submission_id == submission.id)
        .order_by(col(AISubmissionAnalysis.created_at).desc())
    ).first()
    if latest_analysis is None:
        latest_analysis = await run_submission_analysis(db_session, submission_uuid, user, language)
    analysis_report = SubmissionAnalysisReport.model_validate(latest_analysis.analysis_json)
    run = _create_run(
        db_session,
        user=user,
        role=AIThreadRole.TEACHER.value,
        kind="remediation",
        activity_id=submission.activity_id,
        metadata=metadata,
    )
    try:
        bundle, model_name = await generate_remediation(provider, context, analysis_report, language=language)
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
) -> CourseQAAnswer | JsonObject:
    course = _course_or_404(db_session, course_uuid)
    provider, token_budget = _settings_provider()
    context = assemble_course_context(db_session, course, include_unpublished=False)
    input_tokens = _assert_budget(token_budget, db_session, user, f"{question}\n{context}")
    run = _create_run(
        db_session, user=user, role=AIThreadRole.STUDENT.value, kind="study_companion", course_id=course.id
    )
    try:
        answer, model_name = await answer_study_prompt(provider, context, question, mode=mode, language=language)
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
) -> AILectureReview:
    course = _course_or_404(db_session, course_uuid)
    _require_course_update(db_session, course, user)
    provider, token_budget = _settings_provider()
    context = assemble_course_context(db_session, course, include_unpublished=True)
    input_tokens = _assert_budget(token_budget, db_session, user, context)
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
    )
    try:
        report, model_name = await critique_lecture(provider, context, language=language)
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
    role: str,
    language: str,
) -> tuple[AIThread, AIQAMessage, AIQAMessage]:
    course = _course_or_404(db_session, course_uuid)
    provider, token_budget = _settings_provider()
    include_unpublished = role in {AIThreadRole.TEACHER.value, AIThreadRole.AUTHOR.value, AIThreadRole.ADMIN.value}
    context = assemble_course_context(db_session, course, include_unpublished=include_unpublished)
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
    run = _create_run(db_session, user=user, role=role, kind="course_qa", course_id=course.id)
    try:
        answer, model_name = await answer_course_question(provider, context, question, role=role, language=language)
        artifact = _safe_artifact(answer.model_dump(mode="json"))
        citations = _safe_citations([citation.model_dump(mode="json") for citation in answer.citations])
        _finish_run(
            db_session,
            run,
            model_name=model_name,
            kind="course_qa",
            artifact=artifact,
            citations=citations,
            input_tokens=input_tokens,
        )
        assistant_message = AIQAMessage(
            message_uuid=_new_uuid("msg"),
            thread_id=thread.id,
            course_id=course.id,
            user_id=user.id,
            role="assistant",
            content=str(artifact.get("answer_markdown") or ""),
            confidence=answer.confidence,
            citations_json={"citations": citations},
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    course = db_session.get(Course, analysis.course_id)
    if course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
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
