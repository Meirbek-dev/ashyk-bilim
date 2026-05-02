import random
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from sqlmodel import Session, select
from ulid import ULID

from src.auth.users import get_optional_public_user, get_public_user
from src.db.assessments import Assessment
from src.db.courses.exams import (
    AttemptStatusEnum,
    Exam,
    ExamAttempt,
    ExamAttemptRead,
    ExamCreate,
    ExamCreateWithActivity,
    ExamRead,
    ExamUpdate,
    QUESTION_LIMIT_MIN,
    Question,
    QuestionCreate,
    QuestionRead,
    QuestionUpdate,
)
from src.db.courses.courses import Course
from src.db.grading.submissions import AssessmentType, Submission, SubmissionStatus
from src.db.users import AnonymousUser, PublicUser
from src.infra.db.session import get_db_session
from src.services.assessments.core import start_assessment
from src.services.courses.activities.exams import (
    create_exam,
    create_exam_with_activity,
    create_question,
    delete_exam,
    delete_question,
    export_questions_csv,
    get_all_exam_attempts,
    get_attempt_review_questions,
    get_user_attempts,
    import_questions_csv,
    is_course_contributor_or_admin,
    read_exam,
    read_exam_from_activity_uuid,
    read_questions,
    record_violation,
    start_exam_attempt,
    submit_exam_attempt,
    update_exam,
    update_question,
)
from src.services.grading.settings_loader import load_activity_settings
from src.services.grading.submit import submit_assessment as submit_assessment_pipeline

router = APIRouter()


def _assessment_uuid_for_exam(exam_uuid: str, db_session: Session) -> str | None:
    """Return the canonical assessment_uuid for an exam, or None if not found."""
    exam = db_session.exec(
        select(Exam).where(Exam.exam_uuid == exam_uuid)
    ).first()
    if exam is None:
        return None
    assessment = db_session.exec(
        select(Assessment).where(Assessment.activity_id == exam.activity_id)
    ).first()
    return assessment.assessment_uuid if assessment else None


def _get_exam_or_404(exam_uuid: str, db_session: Session) -> Exam:
    exam = db_session.exec(select(Exam).where(Exam.exam_uuid == exam_uuid)).first()
    if exam is None:
        raise HTTPException(status_code=404, detail="Тест не найден")
    return exam


def _get_exam_course_or_404(exam: Exam, db_session: Session) -> Course:
    course = db_session.get(Course, exam.course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Курс не найден")
    return course


def _build_exam_question_order(exam: Exam, db_session: Session) -> list[int]:
    settings = exam.settings or {}
    question_limit = settings.get("question_limit")
    if question_limit is not None and question_limit < QUESTION_LIMIT_MIN:
        raise HTTPException(
            status_code=400,
            detail="Неверно указано ограничение по количеству вопросов для экзамена",
        )

    questions = list(
        db_session.exec(
            select(Question)
            .where(Question.exam_id == exam.id)
            .order_by(Question.order_index)
        ).all()
    )
    if not questions:
        raise HTTPException(status_code=400, detail="В экзамене нет вопросов")

    if question_limit and question_limit < len(questions):
        selected_questions = random.sample(questions, question_limit)
    else:
        selected_questions = questions

    if settings.get("shuffle_questions", True):
        random.shuffle(selected_questions)

    return [question.id for question in selected_questions]


def _submission_started_at_iso(submission: Submission) -> str | None:
    return submission.started_at.isoformat() if submission.started_at else None


def _submission_submitted_at_iso(submission: Submission) -> str | None:
    return submission.submitted_at.isoformat() if submission.submitted_at else None


def _submitted_exam_answers(submission: Submission) -> dict[str, object]:
    payload = submission.answers_json if isinstance(submission.answers_json, dict) else {}
    answers = payload.get("submitted_answers", {})
    return answers if isinstance(answers, dict) else {}


def _exam_violations(submission: Submission) -> list[dict[str, object]]:
    meta = submission.metadata_json if isinstance(submission.metadata_json, dict) else {}
    violations = meta.get("violations", [])
    return list(violations) if isinstance(violations, list) else []


def _question_order_from_submission(submission: Submission) -> list[int] | None:
    meta = submission.metadata_json if isinstance(submission.metadata_json, dict) else {}
    raw = meta.get("question_order")
    if not isinstance(raw, list):
        return None
    question_order: list[int] = []
    for question_id in raw:
        if isinstance(question_id, int):
            question_order.append(question_id)
        elif isinstance(question_id, str) and question_id.isdigit():
            question_order.append(int(question_id))
    return question_order or None


def _attempt_uuid_from_submission(submission: Submission) -> str | None:
    meta = submission.metadata_json if isinstance(submission.metadata_json, dict) else {}
    attempt_uuid = meta.get("attempt_uuid")
    return attempt_uuid if isinstance(attempt_uuid, str) and attempt_uuid else None


def _is_auto_submitted(submission: Submission) -> bool:
    meta = submission.metadata_json if isinstance(submission.metadata_json, dict) else {}
    return meta.get("auto_submitted") is True


def _legacy_attempt_status(submission: Submission) -> AttemptStatusEnum:
    if submission.status == SubmissionStatus.DRAFT:
        return AttemptStatusEnum.IN_PROGRESS
    if _is_auto_submitted(submission):
        return AttemptStatusEnum.AUTO_SUBMITTED
    return AttemptStatusEnum.SUBMITTED


def _max_score_for_question_order(question_order: list[int], db_session: Session) -> int:
    if not question_order:
        return 0
    questions = db_session.exec(
        select(Question).where(Question.id.in_(question_order))
    ).all()
    by_id = {question.id: question for question in questions}
    return int(sum((by_id.get(question_id).points if by_id.get(question_id) else 0) for question_id in question_order))


def _legacy_score_from_submission(submission: Submission, max_score: int) -> int | None:
    percent = submission.final_score
    if percent is None:
        percent = submission.auto_score
    if percent is None:
        return None
    if max_score <= 0:
        return 0
    return int(round((float(percent) / 100.0) * max_score))


def _find_exam_attempt_mirror(submission: Submission, db_session: Session) -> ExamAttempt | None:
    meta = submission.metadata_json if isinstance(submission.metadata_json, dict) else {}
    attempt_id = meta.get("exam_attempt_id")
    if isinstance(attempt_id, int):
        attempt = db_session.get(ExamAttempt, attempt_id)
        if attempt is not None:
            return attempt
    attempt_uuid = meta.get("attempt_uuid")
    if isinstance(attempt_uuid, str) and attempt_uuid:
        return db_session.exec(
            select(ExamAttempt).where(ExamAttempt.attempt_uuid == attempt_uuid)
        ).first()
    return None


def _find_exam_draft_submission(
    exam: Exam,
    user_id: int,
    attempt_uuid: str,
    db_session: Session,
) -> Submission | None:
    drafts = db_session.exec(
        select(Submission).where(
            Submission.activity_id == exam.activity_id,
            Submission.user_id == user_id,
            Submission.assessment_type == AssessmentType.EXAM,
            Submission.status == SubmissionStatus.DRAFT,
        )
    ).all()
    for draft in drafts:
        if _attempt_uuid_from_submission(draft) == attempt_uuid:
            return draft
    return None


def _touch_exam_submission_metadata(
    submission: Submission,
    *,
    attempt_uuid: str,
    question_order: list[int],
    violations: list[dict[str, object]],
    auto_submitted: bool,
) -> None:
    meta = submission.metadata_json if isinstance(submission.metadata_json, dict) else {}
    submission.metadata_json = {
        **meta,
        "attempt_uuid": attempt_uuid,
        "question_order": question_order,
        "violations": violations,
        "auto_submitted": auto_submitted,
    }


def _sync_exam_attempt_mirror(
    exam: Exam,
    submission: Submission,
    db_session: Session,
    *,
    question_order: list[int],
    answers: dict[str, object] | None = None,
    violations: list[dict[str, object]] | None = None,
    is_preview: bool = False,
) -> ExamAttempt:
    attempt = _find_exam_attempt_mirror(submission, db_session)
    if attempt is None:
        attempt = ExamAttempt(
            attempt_uuid=_attempt_uuid_from_submission(submission) or f"attempt_{ULID()}",
            exam_id=exam.id,
            user_id=submission.user_id,
            question_order=question_order,
            answers={},
            violations=[],
            is_preview=is_preview,
            started_at=_submission_started_at_iso(submission) or "",
            creation_date=submission.created_at.isoformat(),
            update_date=submission.updated_at.isoformat(),
        )
        db_session.add(attempt)
        db_session.flush()

    max_score = _max_score_for_question_order(question_order, db_session)
    attempt.question_order = question_order
    attempt.answers = answers if isinstance(answers, dict) else _submitted_exam_answers(submission)
    attempt.violations = violations if isinstance(violations, list) else _exam_violations(submission)
    attempt.status = _legacy_attempt_status(submission)
    attempt.score = _legacy_score_from_submission(submission, max_score)
    attempt.max_score = max_score
    attempt.is_preview = is_preview
    attempt.started_at = _submission_started_at_iso(submission) or attempt.started_at
    attempt.submitted_at = _submission_submitted_at_iso(submission)
    attempt.update_date = submission.updated_at.isoformat()
    if not attempt.creation_date:
        attempt.creation_date = submission.created_at.isoformat()

    db_session.add(attempt)
    _touch_exam_submission_metadata(
        submission,
        attempt_uuid=attempt.attempt_uuid,
        question_order=question_order,
        violations=attempt.violations or [],
        auto_submitted=attempt.status == AttemptStatusEnum.AUTO_SUBMITTED,
    )
    submission.metadata_json = {
        **(submission.metadata_json if isinstance(submission.metadata_json, dict) else {}),
        "exam_attempt_id": attempt.id,
    }
    db_session.add(submission)
    db_session.flush()
    return attempt


def _append_violation(
    violations: list[dict[str, object]],
    *,
    violation_type: str,
) -> list[dict[str, object]]:
    now = datetime.now(UTC).isoformat()
    return [
        *violations,
        {
            "type": violation_type,
            "timestamp": now,
            "violation_count": len(violations) + 1,
        },
    ]


def _apply_time_limit_auto_submit(
    submission: Submission,
    settings: object,
    violations: list[dict[str, object]],
) -> tuple[list[dict[str, object]], bool]:
    time_limit_seconds = getattr(settings, "time_limit_seconds", None)
    started_at = submission.started_at
    if not time_limit_seconds or started_at is None:
        return violations, False
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=UTC)
    now = datetime.now(UTC)
    elapsed_seconds = (now - started_at).total_seconds()
    if elapsed_seconds <= time_limit_seconds + 30:
        return violations, False
    next_violations = [
        *violations,
        {
            "type": "TIME_EXCEEDED",
            "timestamp": now.isoformat(),
            "elapsed_minutes": round(elapsed_seconds / 60, 2),
        },
    ]
    settings.time_limit_seconds = None
    return next_violations, True


async def _should_use_legacy_exam_flow(
    exam: Exam,
    current_user: PublicUser,
    db_session: Session,
) -> bool:
    course = _get_exam_course_or_404(exam, db_session)
    return await is_course_contributor_or_admin(current_user.id, course, db_session)


# Public endpoint to expose exam input limits to frontends
@router.get("/config")
async def api_get_exam_config():
    from src.db.courses.exams import (
        ATTEMPT_LIMIT_MAX,
        ATTEMPT_LIMIT_MIN,
        QUESTION_LIMIT_MIN,
        TIME_LIMIT_MAX,
        TIME_LIMIT_MIN,
        VIOLATION_THRESHOLD_MAX,
        VIOLATION_THRESHOLD_MIN,
    )

    return {
        "time_limit": {"min": TIME_LIMIT_MIN, "max": TIME_LIMIT_MAX},
        "attempt_limit": {"min": ATTEMPT_LIMIT_MIN, "max": ATTEMPT_LIMIT_MAX},
        "violation_threshold": {
            "min": VIOLATION_THRESHOLD_MIN,
            "max": VIOLATION_THRESHOLD_MAX,
        },
        "question_limit": {"min": QUESTION_LIMIT_MIN},
    }


# EXAMS ##


@router.post("")
async def api_create_exam(
    request: Request,
    exam_object: ExamCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamRead:
    return await create_exam(request, exam_object, current_user, db_session)


@router.post("/with-activity")
async def api_create_exam_with_activity(
    request: Request,
    exam_object: ExamCreateWithActivity,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict:
    return await create_exam_with_activity(
        request, exam_object, current_user, db_session
    )


@router.get("/{exam_uuid}")
async def api_get_exam(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_optional_public_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamRead:
    return await read_exam(request, exam_uuid, current_user, db_session)


@router.get("/activity/{activity_uuid}")
async def api_get_exam_from_activity(
    request: Request,
    activity_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_optional_public_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamRead:
    return await read_exam_from_activity_uuid(
        request, activity_uuid, current_user, db_session
    )


@router.put("/{exam_uuid}")
async def api_update_exam(
    request: Request,
    exam_uuid: str,
    exam_object: ExamUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamRead:
    return await update_exam(request, exam_uuid, exam_object, current_user, db_session)


@router.delete("/{exam_uuid}")
async def api_delete_exam(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    return await delete_exam(request, exam_uuid, current_user, db_session)


# QUESTIONS ##


@router.post("/{exam_uuid}/questions")
async def api_create_question(
    request: Request,
    exam_uuid: str,
    question_object: QuestionCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> QuestionRead:
    return await create_question(
        request, exam_uuid, question_object, current_user, db_session
    )


@router.get("/{exam_uuid}/questions")
async def api_get_questions(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[QuestionRead]:
    return await read_questions(request, exam_uuid, current_user, db_session)


@router.put("/questions/{question_uuid}")
async def api_update_question(
    request: Request,
    question_uuid: str,
    question_object: QuestionUpdate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> QuestionRead:
    return await update_question(
        request, question_uuid, question_object, current_user, db_session
    )


@router.delete("/questions/{question_uuid}")
async def api_delete_question(
    request: Request,
    question_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    return await delete_question(request, question_uuid, current_user, db_session)


# EXAM ATTEMPTS ##


@router.post("/{exam_uuid}/attempts/start")
async def api_start_exam_attempt(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamAttemptRead:
    """Start an exam attempt.

    **Deprecated** — compatibility adapter over ``POST /api/v1/assessments/{assessment_uuid}/start``.
    """
    assessment_uuid = _assessment_uuid_for_exam(exam_uuid, db_session)
    if assessment_uuid:
        exam = _get_exam_or_404(exam_uuid, db_session)
        if await _should_use_legacy_exam_flow(exam, current_user, db_session):
            return await start_exam_attempt(request, exam_uuid, current_user, db_session)

        canonical = await start_assessment(assessment_uuid, current_user, db_session)
        submission = db_session.exec(
            select(Submission).where(Submission.submission_uuid == canonical.submission_uuid)
        ).first()
        if submission is None:
            raise HTTPException(status_code=404, detail="Submission draft not found")

        question_order = _question_order_from_submission(submission) or _build_exam_question_order(exam, db_session)
        attempt = _sync_exam_attempt_mirror(
            exam,
            submission,
            db_session,
            question_order=question_order,
            is_preview=False,
        )
        db_session.commit()
        db_session.refresh(attempt)
        return ExamAttemptRead.model_validate(attempt)
    return await start_exam_attempt(request, exam_uuid, current_user, db_session)


@router.post("/{exam_uuid}/attempts/{attempt_uuid}/submit")
async def api_submit_exam_attempt(
    request: Request,
    exam_uuid: str,
    attempt_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamAttemptRead:
    """Submit an exam attempt.

    **Deprecated** — compatibility adapter over ``POST /api/v1/assessments/{assessment_uuid}/submit``.
    """
    assessment_uuid = _assessment_uuid_for_exam(exam_uuid, db_session)
    if assessment_uuid:
        exam = _get_exam_or_404(exam_uuid, db_session)
        if await _should_use_legacy_exam_flow(exam, current_user, db_session):
            body = await request.json()
            answers = body if isinstance(body, dict) else {}
            return await submit_exam_attempt(
                request, attempt_uuid, answers, current_user, db_session
            )

        body = await request.json()
        answers = body if isinstance(body, dict) else {}
        submission = _find_exam_draft_submission(
            exam,
            current_user.id,
            attempt_uuid,
            db_session,
        )
        if submission is None:
            raise HTTPException(status_code=404, detail="Попытка не найдена")

        question_order = _question_order_from_submission(submission) or _build_exam_question_order(exam, db_session)
        current_violations = _exam_violations(submission)
        settings = load_activity_settings(exam.activity_id, AssessmentType.EXAM, db_session)
        next_violations, auto_submitted = _apply_time_limit_auto_submit(
            submission,
            settings,
            current_violations,
        )
        _touch_exam_submission_metadata(
            submission,
            attempt_uuid=attempt_uuid,
            question_order=question_order,
            violations=next_violations,
            auto_submitted=auto_submitted,
        )
        db_session.add(submission)
        db_session.flush()

        canonical = await submit_assessment_pipeline(
            request=None,
            activity_id=exam.activity_id,
            assessment_type=AssessmentType.EXAM,
            answers_payload={"submitted_answers": answers},
            settings=settings,
            current_user=current_user,
            db_session=db_session,
            violation_count=len(next_violations),
            submission_uuid=submission.submission_uuid,
        )
        canonical_submission = db_session.exec(
            select(Submission).where(Submission.submission_uuid == canonical.submission_uuid)
        ).first()
        if canonical_submission is None:
            raise HTTPException(status_code=404, detail="Submitted exam not found")

        attempt = _sync_exam_attempt_mirror(
            exam,
            canonical_submission,
            db_session,
            question_order=question_order,
            answers=answers,
            violations=next_violations,
            is_preview=False,
        )
        db_session.commit()
        db_session.refresh(attempt)
        return ExamAttemptRead.model_validate(attempt)
    body = await request.json()
    answers = body if isinstance(body, dict) else {}
    return await submit_exam_attempt(
        request, attempt_uuid, answers, current_user, db_session
    )


@router.post("/{exam_uuid}/attempts/{attempt_uuid}/violations")
async def api_record_violation(
    request: Request,
    exam_uuid: str,
    attempt_uuid: str,
    violation_data: dict,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamAttemptRead:
    """Record an anti-cheat violation.

    **Deprecated** — violations are now written to Submission.metadata_json.violations
    via ``PATCH /api/v1/assessments/{assessment_uuid}/draft``. This endpoint continues
    to accept requests and delegates to the legacy service during the shim period.
    """
    violation_type = violation_data.get("type", "UNKNOWN")
    answers = violation_data.get("answers", {})
    assessment_uuid = _assessment_uuid_for_exam(exam_uuid, db_session)
    if assessment_uuid:
        exam = _get_exam_or_404(exam_uuid, db_session)
        if await _should_use_legacy_exam_flow(exam, current_user, db_session):
            return await record_violation(
                request,
                attempt_uuid,
                violation_type,
                current_user,
                db_session,
                answers,
            )

        submission = _find_exam_draft_submission(
            exam,
            current_user.id,
            attempt_uuid,
            db_session,
        )
        if submission is None:
            raise HTTPException(status_code=404, detail="Попытка не найдена")

        question_order = _question_order_from_submission(submission) or _build_exam_question_order(exam, db_session)
        next_violations = _append_violation(_exam_violations(submission), violation_type=violation_type)
        payload = submission.answers_json if isinstance(submission.answers_json, dict) else {}
        next_answers = answers if isinstance(answers, dict) else _submitted_exam_answers(submission)
        submission.answers_json = {
            **payload,
            "submitted_answers": next_answers,
        }
        _touch_exam_submission_metadata(
            submission,
            attempt_uuid=attempt_uuid,
            question_order=question_order,
            violations=next_violations,
            auto_submitted=False,
        )
        db_session.add(submission)
        db_session.flush()

        settings = load_activity_settings(exam.activity_id, AssessmentType.EXAM, db_session)
        threshold = exam.settings.get("violation_threshold") if isinstance(exam.settings, dict) else None
        if isinstance(threshold, int) and threshold > 0 and len(next_violations) >= threshold:
            submission.metadata_json = {
                **(submission.metadata_json if isinstance(submission.metadata_json, dict) else {}),
                "auto_submitted": True,
            }
            db_session.add(submission)
            db_session.flush()
            canonical = await submit_assessment_pipeline(
                request=None,
                activity_id=exam.activity_id,
                assessment_type=AssessmentType.EXAM,
                answers_payload={"submitted_answers": next_answers},
                settings=settings,
                current_user=current_user,
                db_session=db_session,
                violation_count=len(next_violations),
                submission_uuid=submission.submission_uuid,
            )
            canonical_submission = db_session.exec(
                select(Submission).where(Submission.submission_uuid == canonical.submission_uuid)
            ).first()
            if canonical_submission is None:
                raise HTTPException(status_code=404, detail="Submitted exam not found")
            attempt = _sync_exam_attempt_mirror(
                exam,
                canonical_submission,
                db_session,
                question_order=question_order,
                answers=next_answers,
                violations=next_violations,
                is_preview=False,
            )
            db_session.commit()
            db_session.refresh(attempt)
            return ExamAttemptRead.model_validate(attempt)

        attempt = _sync_exam_attempt_mirror(
            exam,
            submission,
            db_session,
            question_order=question_order,
            answers=next_answers,
            violations=next_violations,
            is_preview=False,
        )
        db_session.commit()
        db_session.refresh(attempt)
        return ExamAttemptRead.model_validate(attempt)
    return await record_violation(
        request, attempt_uuid, violation_type, current_user, db_session, answers
    )


@router.get("/{exam_uuid}/attempts/me")
async def api_get_my_attempts(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[ExamAttemptRead]:
    return await get_user_attempts(request, exam_uuid, current_user, db_session)


@router.get("/attempts/{attempt_uuid}")
async def api_get_attempt_by_uuid(
    request: Request,
    attempt_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ExamAttemptRead:
    """
    Get a specific exam attempt by UUID.

    - Students can only access their own attempts
    - Teachers/admins can access any attempt for exams they manage
    """
    from src.services.courses.activities.exams import get_attempt_by_uuid

    return await get_attempt_by_uuid(request, attempt_uuid, current_user, db_session)


@router.get("/attempts/{attempt_uuid}/questions")
async def api_get_attempt_review_questions(
    request: Request,
    attempt_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[QuestionRead]:
    return await get_attempt_review_questions(
        request, attempt_uuid, current_user, db_session
    )


@router.get("/{exam_uuid}/attempts/all")
async def api_get_all_attempts(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> list[dict]:
    """Get all exam attempts for teacher results dashboard"""
    return await get_all_exam_attempts(request, exam_uuid, current_user, db_session)


@router.get("/{exam_uuid}/questions/export-csv")
async def api_export_questions_csv(
    request: Request,
    exam_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Export exam questions to CSV"""
    from fastapi.responses import Response

    csv_content = await export_questions_csv(
        request, exam_uuid, current_user, db_session
    )

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=exam_{exam_uuid}_questions.csv"
        },
    )


@router.post("/{exam_uuid}/questions/import-csv")
async def api_import_questions_csv(
    request: Request,
    exam_uuid: str,
    file: UploadFile,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict:
    """Import exam questions from CSV"""
    csv_content = (await file.read()).decode("utf-8")
    return await import_questions_csv(
        request, exam_uuid, csv_content, current_user, db_session
    )


@router.post("/{exam_uuid}/questions/reorder")
async def api_reorder_questions(
    request: Request,
    exam_uuid: str,
    question_order: list[dict],  # [{"question_uuid": str, "order_index": int}, ...]
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> dict:
    """Bulk update question order"""
    from src.services.courses.activities.exams import reorder_questions

    return await reorder_questions(
        request, exam_uuid, question_order, current_user, db_session
    )
