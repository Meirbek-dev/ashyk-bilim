import logging
import random
from datetime import UTC, datetime

from fastapi import HTTPException, Request
from sqlmodel import Session, select
from ulid import ULID

from src.db.courses.activities import (
    Activity,
    ActivitySubTypeEnum,
    ActivityTypeEnum,
)
from src.db.courses.courses import Course
from src.db.courses.exams import (
    ATTEMPT_LIMIT_MAX,
    ATTEMPT_LIMIT_MIN,
    QUESTION_LIMIT_MIN,
    AccessModeEnum,
    AttemptStatusEnum,
    Exam,
    ExamAttempt,
    ExamAttemptCreate,
    ExamAttemptRead,
    ExamAttemptUpdate,
    ExamCreate,
    ExamCreateWithActivity,
    ExamRead,
    ExamSettingsBase,
    ExamUpdate,
    Question,
    QuestionCreate,
    QuestionRead,
    QuestionReadStudent,
    QuestionTypeEnum,
    QuestionUpdate,
)
from src.db.resource_authors import (
    ResourceAuthor,
    ResourceAuthorshipEnum,
    ResourceAuthorshipStatusEnum,
)
from src.db.trail_steps import TrailStep
from src.db.users import AnonymousUser, PublicUser, User
from src.security.rbac import (
    AuthenticationRequired,
    PermissionChecker,
    PermissionDenied,
    ResourceAccessDenied,
)

logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    """Return current UTC time as ISO string."""
    return datetime.now(UTC).isoformat()


## > Helper Functions


async def is_course_contributor_or_admin(
    user_id: int,
    course: Course,
    db_session: Session,
) -> bool:
    """
    Check if user is a course contributor (teacher) or admin.
    Teachers/contributors should have unlimited exam attempts for preview/testing.
    """
    # Check if user is course contributor (CREATOR, MAINTAINER, CONTRIBUTOR)
    statement = select(ResourceAuthor).where(
        ResourceAuthor.resource_uuid == course.course_uuid,
        ResourceAuthor.user_id == user_id,
    )
    resource_author = db_session.exec(statement).first()

    return bool(
        resource_author
        and (
            resource_author.authorship
            in (
                ResourceAuthorshipEnum.CREATOR,
                ResourceAuthorshipEnum.MAINTAINER,
                ResourceAuthorshipEnum.CONTRIBUTOR,
            )
            and resource_author.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE
        )
    )


## > Exams CRUD


async def create_exam(
    request: Request,
    exam_object: ExamCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ExamRead:
    """Create a new exam"""

    course = db_session.get(Course, exam_object.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")

    activity = db_session.get(Activity, exam_object.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Активность не найдена")

    # RBAC check: ensure user can create content in this course
    course = db_session.get(Course, exam_object.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "exam:create",
        resource_owner_id=course.creator_id,
    )

    # Validate settings against ExamSettingsBase so frontend limits are enforced server-side
    try:
        validated_settings = ExamSettingsBase.model_validate(exam_object.settings or {})
        settings_dict = validated_settings.model_dump()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Неверные настройки: {e}")

    # Create exam
    exam_uuid = f"exam_{ULID()}"
    now = _utc_now_iso()

    exam = Exam(
        exam_uuid=exam_uuid,
        title=exam_object.title,
        description=exam_object.description,
        published=exam_object.published,
        course_id=exam_object.course_id,
        chapter_id=exam_object.chapter_id,
        activity_id=exam_object.activity_id,
        settings=settings_dict,
        creation_date=now,
        update_date=now,
    )

    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    return ExamRead.model_validate(exam)


async def read_exam(
    request: Request,
    exam_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ExamRead:
    """Read an exam by UUID"""
    statement = select(Exam).where(Exam.exam_uuid == exam_uuid)
    exam = db_session.exec(statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # RBAC check
    course = db_session.get(Course, exam.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "exam:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    return ExamRead.model_validate(exam)


async def read_exam_from_activity_uuid(
    request: Request,
    activity_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ExamRead:
    """Read an exam by activity UUID"""
    statement = select(Activity).where(Activity.activity_uuid == activity_uuid)
    activity = db_session.exec(statement).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Активность не найдена")

    statement = select(Exam).where(Exam.activity_id == activity.id)
    exam = db_session.exec(statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # RBAC check
    course = db_session.get(Course, exam.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "exam:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    return ExamRead.model_validate(exam)


async def update_exam(
    request: Request,
    exam_uuid: str,
    exam_object: ExamUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ExamRead:
    """Update an exam"""

    statement = select(Exam).where(Exam.exam_uuid == exam_uuid)
    exam = db_session.exec(statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # RBAC check
    course = db_session.get(Course, exam.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "exam:update",
        resource_owner_id=course.creator_id,
    )

    # Update fields
    update_data = exam_object.model_dump(exclude_unset=True)

    # If settings are provided, validate them and replace with normalized dict
    if "settings" in update_data:
        try:
            validated_settings = ExamSettingsBase.model_validate(
                update_data.get("settings") or {}
            )
            update_data["settings"] = validated_settings.model_dump()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Неверные настройки: {e}")

    for key, value in update_data.items():
        setattr(exam, key, value)

    exam.update_date = _utc_now_iso()

    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    return ExamRead.model_validate(exam)


async def delete_exam(
    request: Request,
    exam_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    """Delete an exam"""

    statement = select(Exam).where(Exam.exam_uuid == exam_uuid)
    exam = db_session.exec(statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # RBAC check
    course = db_session.get(Course, exam.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "exam:delete",
        resource_owner_id=course.creator_id,
    )

    db_session.delete(exam)
    db_session.commit()

    return {"message": "Экзамен успешно удалён"}


async def create_exam_with_activity(
    request: Request,
    exam_object: ExamCreateWithActivity,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """Create an exam with associated activity in one request"""

    # Get chapter to determine course and platform context
    from src.db.courses.chapters import Chapter

    chapter = db_session.get(Chapter, exam_object.chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Глава не найдена")

    course = db_session.get(Course, chapter.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")

    # RBAC check: ensure user can create content in this course
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "exam:create",
        resource_owner_id=course.creator_id,
    )

    # Validate settings
    try:
        validated_settings = ExamSettingsBase.model_validate(exam_object.settings or {})
        settings_dict = validated_settings.model_dump()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Неверные настройки: {e}")

    # Create activity
    activity_uuid = f"activity_{ULID()}"
    activity_now = datetime.now(UTC)
    now = activity_now.isoformat()

    last_in_chapter = db_session.exec(
        select(Activity)
        .where(Activity.chapter_id == chapter.id)
        .order_by(Activity.order.desc())
    ).first()
    next_order = (last_in_chapter.order if last_in_chapter else 0) + 1

    activity = Activity(
        activity_uuid=activity_uuid,
        name=exam_object.activity_name,
        activity_type=ActivityTypeEnum.TYPE_EXAM,
        activity_sub_type=ActivitySubTypeEnum.SUBTYPE_EXAM_STANDARD,
        content={},
        details={},
        published=False,
        chapter_id=chapter.id,
        course_id=course.id,  # keep legacy column in sync
        order=next_order,
        creator_id=current_user.id,
        creation_date=activity_now,
        update_date=activity_now,
    )

    db_session.add(activity)
    db_session.flush()

    # Create exam
    exam_uuid = f"exam_{ULID()}"

    exam = Exam(
        exam_uuid=exam_uuid,
        title=exam_object.exam_title,
        description=exam_object.exam_description,
        published=False,
        course_id=course.id,
        chapter_id=chapter.id,
        activity_id=activity.id,
        settings=settings_dict,
        creation_date=now,
        update_date=now,
    )

    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)
    db_session.refresh(activity)

    return {
        "exam": ExamRead.model_validate(exam),
        "activity_uuid": activity.activity_uuid,
    }


## > Questions CRUD


async def create_question(
    request: Request,
    exam_uuid: str,
    question_object: QuestionCreate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> QuestionRead:
    """Create a question for an exam"""

    statement = select(Exam).where(Exam.exam_uuid == exam_uuid)
    exam = db_session.exec(statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # RBAC check
    course = db_session.get(Course, exam.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "exam:create",
        resource_owner_id=course.creator_id,
    )

    # Input validation and sanitization
    if not question_object.question_text or not question_object.question_text.strip():
        raise HTTPException(
            status_code=400, detail="Текст вопроса не может быть пустым"
        )

    if len(question_object.question_text) > 5000:
        raise HTTPException(
            status_code=400,
            detail="Текст вопроса слишком длинный (макс. 5000 символов)",
        )

    if question_object.explanation and len(question_object.explanation) > 2000:
        raise HTTPException(
            status_code=400, detail="Пояснение слишком длинное (макс. 2000 символов)"
        )

    # Validate answer_options based on question type
    if not question_object.answer_options or len(question_object.answer_options) == 0:
        raise HTTPException(
            status_code=400, detail="Требуется как минимум один вариант ответа"
        )

    if len(question_object.answer_options) > 10:
        raise HTTPException(
            status_code=400, detail="Слишком много вариантов ответа (макс. 10)"
        )

    # Validate that at least one correct answer exists (except for essay/custom)
    if question_object.question_type in [
        QuestionTypeEnum.SINGLE_CHOICE,
        QuestionTypeEnum.MULTIPLE_CHOICE,
        QuestionTypeEnum.TRUE_FALSE,
    ]:
        has_correct = any(
            opt.get("is_correct") for opt in question_object.answer_options
        )
        if not has_correct:
            raise HTTPException(
                status_code=400,
                detail="Необходим хотя бы один вариант, отмеченный как правильный",
            )

    # Create question
    question_uuid = f"question_{ULID()}"
    now = _utc_now_iso()

    question = Question(
        question_uuid=question_uuid,
        question_text=question_object.question_text,
        question_type=question_object.question_type,
        points=question_object.points,
        explanation=question_object.explanation,
        order_index=question_object.order_index,
        answer_options=question_object.answer_options,
        exam_id=exam.id,
        creation_date=now,
        update_date=now,
    )

    db_session.add(question)
    db_session.commit()
    db_session.refresh(question)

    return QuestionRead.model_validate(question)


async def read_questions(
    request: Request,
    exam_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[QuestionRead] | list[QuestionReadStudent]:
    """Read all questions for an exam.

    Teachers get full data (including is_correct).
    Students get stripped data (is_correct removed, answers shuffled).
    """
    statement = select(Exam).where(Exam.exam_uuid == exam_uuid)
    exam = db_session.exec(statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # RBAC check
    course = db_session.get(Course, exam.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "exam:read",
        is_assigned=True,
        resource_owner_id=course.creator_id,
    )

    statement = (
        select(Question)
        .where(Question.exam_id == exam.id)
        .order_by(Question.order_index)
    )
    questions = db_session.exec(statement).all()

    # Teachers get full data
    is_teacher = await is_course_contributor_or_admin(
        current_user.id, course, db_session
    )
    if is_teacher:
        return [QuestionRead.model_validate(q) for q in questions]

    # Students get stripped data (is_correct removed, answers shuffled)
    settings = exam.settings or {}
    shuffle_answers = settings.get("shuffle_answers", True)
    return [
        QuestionReadStudent.from_question(q, shuffle_answers=shuffle_answers)
        for q in questions
    ]


async def update_question(
    request: Request,
    question_uuid: str,
    question_object: QuestionUpdate,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> QuestionRead:
    """Update a question"""

    statement = select(Question).where(Question.question_uuid == question_uuid)
    question = db_session.exec(statement).first()

    if not question:
        raise HTTPException(status_code=404, detail="Вопрос не найден")

    exam = db_session.get(Exam, question.exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # RBAC check
    course = db_session.get(Course, exam.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "exam:update",
        resource_owner_id=course.creator_id,
    )

    # Update fields
    update_data = question_object.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(question, key, value)

    question.update_date = _utc_now_iso()

    db_session.add(question)
    db_session.commit()
    db_session.refresh(question)

    return QuestionRead.model_validate(question)


async def delete_question(
    request: Request,
    question_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict[str, str]:
    """Delete a question"""

    statement = select(Question).where(Question.question_uuid == question_uuid)
    question = db_session.exec(statement).first()

    if not question:
        raise HTTPException(status_code=404, detail="Вопрос не найден")

    exam = db_session.get(Exam, question.exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # RBAC check
    course = db_session.get(Course, exam.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "exam:delete",
        resource_owner_id=course.creator_id,
    )

    db_session.delete(question)
    db_session.commit()

    return {"message": "Вопрос успешно удалён"}


## > Exam Attempts


async def start_exam_attempt(
    request: Request,
    exam_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ExamAttemptRead:
    """Start a new exam attempt for the current user"""
    if isinstance(current_user, AnonymousUser):
        raise AuthenticationRequired(reason="Authentication required to start exam")

    statement = select(Exam).where(Exam.exam_uuid == exam_uuid)
    exam = db_session.exec(statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # Get course to check contributor status
    course = db_session.get(Course, exam.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")

    # Check if user is a teacher/contributor (teachers have unlimited attempts)
    is_teacher = await is_course_contributor_or_admin(
        current_user.id, course, db_session
    )

    # Check access (teachers bypass access restrictions for preview/testing)
    settings = exam.settings or {}
    access_mode = settings.get("access_mode", "NO_ACCESS")

    if not is_teacher:
        if access_mode == "NO_ACCESS":
            raise ResourceAccessDenied(reason="Exam not accessible")

        if access_mode == "WHITELIST":
            whitelist = settings.get("whitelist_user_ids", [])
            if current_user.id not in whitelist:
                raise ResourceAccessDenied(reason="Not in whitelist")

    # Check attempt limit (teachers have unlimited attempts)
    if not is_teacher:
        attempt_limit = settings.get("attempt_limit")
        if attempt_limit is not None:
            # validate configured value against allowed bounds
            if not (ATTEMPT_LIMIT_MIN <= attempt_limit <= ATTEMPT_LIMIT_MAX):
                raise HTTPException(
                    status_code=400,
                    detail="Неверно указано ограничение попыток для экзамена",
                )

            # ATOMIC CHECK: Use FOR UPDATE to prevent race condition.
            # Postgres does not allow FOR UPDATE with aggregate functions, so lock the
            # matching rows and count in Python instead to perform an atomic check.

            statement = (
                select(ExamAttempt.id)
                .where(
                    ExamAttempt.exam_id == exam.id,
                    ExamAttempt.user_id == current_user.id,
                )
                .with_for_update()
            )
            # db_session.exec(...) may return a ScalarResult; calling .scalars() on it
            # can raise AttributeError. Use .all() which works for both Result and
            # ScalarResult and returns a list of ids.
            existing_attempt_ids = db_session.exec(statement).all()
            attempt_count = len(existing_attempt_ids)
            if attempt_count >= attempt_limit:
                raise ResourceAccessDenied(reason="Attempt limit reached")

    # Validate question_limit if present
    question_limit = settings.get("question_limit")
    if question_limit is not None and question_limit < QUESTION_LIMIT_MIN:
        raise HTTPException(
            status_code=400,
            detail="Неверно указано ограничение по количеству вопросов для экзамена",
        )

    # Get all questions for this exam
    statement = (
        select(Question)
        .where(Question.exam_id == exam.id)
        .order_by(Question.order_index)
    )
    all_questions = list(db_session.exec(statement).all())

    if not all_questions:
        raise HTTPException(status_code=400, detail="В экзамене нет вопросов")

    # Apply question limit if configured
    question_limit = settings.get("question_limit")
    if question_limit and question_limit < len(all_questions):
        selected_questions = random.sample(all_questions, question_limit)
    else:
        selected_questions = all_questions

    # Shuffle questions if configured
    if settings.get("shuffle_questions", True):
        random.shuffle(selected_questions)

    question_order = [q.id for q in selected_questions]

    # Create attempt
    attempt_uuid = f"attempt_{ULID()}"
    now_iso = _utc_now_iso()

    attempt = ExamAttempt(
        attempt_uuid=attempt_uuid,
        exam_id=exam.id,
        user_id=current_user.id,
        status=AttemptStatusEnum.IN_PROGRESS,
        question_order=question_order,
        answers={},
        violations=[],
        is_preview=is_teacher,  # Mark teacher attempts as preview (exclude from analytics)
        started_at=now_iso,
        creation_date=now_iso,
        update_date=now_iso,
    )

    db_session.add(attempt)
    db_session.commit()
    db_session.refresh(attempt)

    return ExamAttemptRead.model_validate(attempt)


async def _grade_and_finalize_attempt(
    attempt: ExamAttempt,
    answers: dict,
    status: AttemptStatusEnum,
    db_session: Session,
    request: Request,
    user_id: int,
) -> None:
    """Grade an attempt, set score/status, award XP, and mark activity complete.

    Shared by submit_exam_attempt and record_violation (auto-submit).
    Does NOT commit - caller must commit.
    """
    # Calculate score
    total_score = 0
    max_score = 0

    # Batch fetch all questions for this attempt in one query
    question_ids = attempt.question_order or []
    questions_map: dict[int, Question] = {}
    if question_ids:
        questions_map = {
            q.id: q
            for q in db_session.exec(
                select(Question).where(Question.id.in_(question_ids))
            ).all()
        }

    for question_id in question_ids:
        question = questions_map.get(question_id)
        if not question:
            continue

        max_score += question.points

        user_answer = answers.get(str(question_id))
        if user_answer is None:
            continue

        try:
            if check_answer_correctness(question, user_answer):
                total_score += question.points
        except Exception as e:
            logger.exception(f"Error validating answer for question {question_id}: {e}")
            continue

    now = _utc_now_iso()
    attempt.answers = answers
    attempt.score = total_score
    attempt.max_score = max_score
    attempt.status = status
    attempt.submitted_at = now
    attempt.update_date = now

    db_session.add(attempt)
    db_session.flush()

    # Award gamification XP (skip preview attempts)
    if not attempt.is_preview:
        percentage = (total_score / max_score * 100) if max_score > 0 else 0

        try:
            from src.services.gamification.service import award_xp

            award_xp(
                db=db_session,
                user_id=user_id,
                source="exam_completion",
                source_id=f"exam_{attempt.attempt_uuid}",
                idempotency_key=f"exam_completion_{attempt.attempt_uuid}",
            )

            if percentage == 100:
                award_xp(
                    db=db_session,
                    user_id=user_id,
                    source="streak_bonus",
                    source_id=f"exam_perfect_{attempt.attempt_uuid}",
                    idempotency_key=f"exam_perfect_{attempt.attempt_uuid}",
                )
        except Exception as e:
            logger.exception(f"Failed to award XP for exam {attempt.attempt_uuid}: {e}")

        # Mark activity as complete only if score percentage exceeds 50%
        if percentage > 50:
            exam = db_session.get(Exam, attempt.exam_id)
            if exam:
                try:
                    await mark_exam_complete(
                        request, exam.activity_id, user_id, db_session
                    )
                except Exception as e:
                    logger.exception(
                        f"Failed to mark exam complete for attempt {attempt.attempt_uuid}: {e}"
                    )


def _validate_attempt_answers(attempt: ExamAttempt, answers: dict) -> None:
    """Ensure submitted answer keys belong to this attempt."""
    valid_question_ids = {str(qid) for qid in attempt.question_order}
    for answer_key in answers:
        if str(answer_key) not in valid_question_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Недопустимый идентификатор вопроса в ответах: {answer_key}",
            )


async def submit_exam_attempt(
    request: Request,
    attempt_uuid: str,
    answers: dict,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ExamAttemptRead:
    """Submit an exam attempt"""
    if isinstance(current_user, AnonymousUser):
        raise AuthenticationRequired(reason="Authentication required to submit exam")

    statement = select(ExamAttempt).where(ExamAttempt.attempt_uuid == attempt_uuid)
    attempt = db_session.exec(statement).first()

    if not attempt:
        raise HTTPException(status_code=404, detail="Попытка не найдена")

    if attempt.user_id != current_user.id:
        raise ResourceAccessDenied(reason="Not your exam attempt")

    if attempt.status != AttemptStatusEnum.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Попытка уже отправлена")

    # Get exam to validate time limit server-side
    exam = db_session.get(Exam, attempt.exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # SERVER-SIDE TIME LIMIT VALIDATION (Security: prevent client bypass)
    status = AttemptStatusEnum.SUBMITTED
    settings = exam.settings or {}
    time_limit_minutes = settings.get("time_limit")
    if time_limit_minutes:
        try:
            started_at = datetime.fromisoformat(attempt.started_at)
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=UTC)
            now = datetime.now(UTC)
            elapsed_minutes = (now - started_at).total_seconds() / 60

            # Add 30-second grace period for network latency
            if elapsed_minutes > (time_limit_minutes + 0.5):
                status = AttemptStatusEnum.AUTO_SUBMITTED
                attempt.violations = attempt.violations or []
                attempt.violations.append({
                    "type": "TIME_EXCEEDED",
                    "timestamp": now.isoformat(),
                    "elapsed_minutes": round(elapsed_minutes, 2),
                })
        except (ValueError, AttributeError) as e:
            logger.warning(
                f"Failed to validate time limit for attempt {attempt_uuid}: {e}"
            )

    _validate_attempt_answers(attempt, answers)

    try:
        await _grade_and_finalize_attempt(
            attempt, answers, status, db_session, request, current_user.id
        )
        db_session.commit()
        db_session.refresh(attempt)
        return ExamAttemptRead.model_validate(attempt)

    except Exception as e:
        db_session.rollback()
        logger.error(
            f"Failed to submit exam attempt {attempt_uuid}: {e}", exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail="Не удалось отправить экзамен. Пожалуйста, попробуйте ещё раз.",
        )


async def record_violation(
    request: Request,
    attempt_uuid: str,
    violation_type: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
    answers: dict | None = None,
) -> ExamAttemptRead:
    """Record a violation during an exam attempt"""
    if isinstance(current_user, AnonymousUser):
        raise AuthenticationRequired(
            reason="Authentication required to record violation"
        )

    statement = select(ExamAttempt).where(ExamAttempt.attempt_uuid == attempt_uuid)
    attempt = db_session.exec(statement).first()

    if not attempt:
        raise HTTPException(status_code=404, detail="Попытка не найдена")

    if attempt.user_id != current_user.id:
        raise ResourceAccessDenied(reason="Not your exam attempt")

    if attempt.status != AttemptStatusEnum.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Попытка уже отправлена")

    if answers is not None:
        if not isinstance(answers, dict):
            raise HTTPException(status_code=400, detail="Неверный формат ответов")
        _validate_attempt_answers(attempt, answers)
        attempt.answers = answers

    now = _utc_now_iso()

    # Add violation
    violation = {
        "type": violation_type,
        "timestamp": now,
    }

    violations = attempt.violations or []
    violations.append(violation)
    attempt.violations = violations
    attempt.update_date = now

    logger.warning(
        "Exam violation recorded",
        extra={
            "event": "exam_violation",
            "attempt_uuid": attempt_uuid,
            "user_id": current_user.id,
            "exam_id": attempt.exam_id,
            "violation_type": violation_type,
            "violation_count": len(violations),
            "timestamp": now,
        },
    )

    # Check violation threshold - grade and finalize on auto-submit
    exam = db_session.get(Exam, attempt.exam_id)
    if exam:
        settings = exam.settings or {}
        threshold = settings.get("violation_threshold")
        if threshold and len(violations) >= threshold:
            logger.warning(
                "Exam auto-submitted due to violation threshold",
                extra={
                    "event": "exam_auto_submitted",
                    "attempt_uuid": attempt_uuid,
                    "user_id": current_user.id,
                    "exam_id": attempt.exam_id,
                    "violation_count": len(violations),
                    "threshold": threshold,
                },
            )
            # Grade with whatever answers are saved
            answers = attempt.answers or {}
            await _grade_and_finalize_attempt(
                attempt,
                answers,
                AttemptStatusEnum.AUTO_SUBMITTED,
                db_session,
                request,
                current_user.id,
            )
            db_session.commit()
            db_session.refresh(attempt)
            return ExamAttemptRead.model_validate(attempt)

    db_session.add(attempt)
    db_session.commit()
    db_session.refresh(attempt)

    return ExamAttemptRead.model_validate(attempt)


async def get_user_attempts(
    request: Request,
    exam_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[ExamAttemptRead]:
    """Get all attempts for current user"""
    if isinstance(current_user, AnonymousUser):
        raise AuthenticationRequired(reason="Authentication required to view attempts")

    statement = select(Exam).where(Exam.exam_uuid == exam_uuid)
    exam = db_session.exec(statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    statement = (
        select(ExamAttempt)
        .where(
            ExamAttempt.exam_id == exam.id,
            ExamAttempt.user_id == current_user.id,
        )
        .order_by(ExamAttempt.creation_date.desc())
    )

    attempts = db_session.exec(statement).all()
    return [ExamAttemptRead.model_validate(a) for a in attempts]


async def get_attempt_by_uuid(
    request: Request,
    attempt_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> ExamAttemptRead:
    """
    Get a specific exam attempt by UUID.

    Optimized: fetch attempt and related records in a single joined query and
    short-circuit the owner path to avoid extra DB roundtrips. Preserves original
    404 semantics for missing related records.
    """
    if isinstance(current_user, AnonymousUser):
        raise AuthenticationRequired(reason="Authentication required to view attempt")

    # Fetch attempt + related records in one query (use outer joins so we can
    # detect missing relations and raise appropriate 404s while keeping a
    # single roundtrip).
    statement = (
        select(
            ExamAttempt,
            Exam,
            Activity,
            Course,
            ResourceAuthor,
        )
        .join(Exam, Exam.id == ExamAttempt.exam_id, isouter=True)
        .join(Activity, Activity.id == Exam.activity_id, isouter=True)
        .join(Course, Course.id == Activity.course_id, isouter=True)
        .join(
            ResourceAuthor,
            (ResourceAuthor.resource_uuid == Course.course_uuid)
            & (ResourceAuthor.user_id == current_user.id),
            isouter=True,
        )
        .where(ExamAttempt.attempt_uuid == attempt_uuid)
    )

    row = db_session.exec(statement).first()

    if not row:
        # No attempt at all
        raise HTTPException(status_code=404, detail="Попытка не найдена")

    # row is a tuple: (attempt, exam, activity, course, resource_author)
    attempt, exam, activity, course, resource_author = row

    # Preserve original 404 behavior for missing linked records
    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")
    if not activity:
        raise HTTPException(status_code=404, detail="Активность не найдена")
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")

    # Authorization check: owner can always view their attempt
    is_owner = attempt.user_id == current_user.id
    if is_owner:
        return ExamAttemptRead.model_validate(attempt)

    # Otherwise check if user is a course contributor/admin using the joined
    # ResourceAuthor row (if present)
    if (
        resource_author
        and resource_author.authorship
        in (
            ResourceAuthorshipEnum.CREATOR,
            ResourceAuthorshipEnum.MAINTAINER,
            ResourceAuthorshipEnum.CONTRIBUTOR,
        )
        and resource_author.authorship_status == ResourceAuthorshipStatusEnum.ACTIVE
    ):
        return ExamAttemptRead.model_validate(attempt)

    raise HTTPException(
        status_code=403, detail="Доступ к просмотру этой попытки запрещён"
    )


async def get_attempt_review_questions(
    request: Request,
    attempt_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[QuestionRead]:
    """Return full question data for a submitted attempt review."""
    if isinstance(current_user, AnonymousUser):
        raise AuthenticationRequired(reason="Authentication required to view attempt")

    statement = select(ExamAttempt).where(ExamAttempt.attempt_uuid == attempt_uuid)
    attempt = db_session.exec(statement).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Попытка не найдена")

    exam = db_session.get(Exam, attempt.exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    course = db_session.get(Course, exam.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")

    is_owner = attempt.user_id == current_user.id
    is_teacher = await is_course_contributor_or_admin(
        current_user.id, course, db_session
    ) or bool(course.creator_id and course.creator_id == current_user.id)

    if not is_owner and not is_teacher:
        raise HTTPException(
            status_code=403, detail="Доступ к просмотру этой попытки запрещён"
        )

    if not is_teacher:
        settings = exam.settings or {}
        if attempt.status == AttemptStatusEnum.IN_PROGRESS:
            raise HTTPException(status_code=400, detail="Попытка ещё не отправлена")
        if not settings.get("allow_result_review", False):
            raise ResourceAccessDenied(reason="Result review is disabled")
        if not settings.get("show_correct_answers", False):
            raise ResourceAccessDenied(reason="Correct answer review is disabled")

    question_ids = attempt.question_order or []
    if not question_ids:
        return []

    questions = db_session.exec(
        select(Question).where(Question.id.in_(question_ids))
    ).all()
    questions_by_id = {question.id: question for question in questions}

    return [
        QuestionRead.model_validate(questions_by_id[question_id])
        for question_id in question_ids
        if question_id in questions_by_id
    ]


## > Helper Functions


def check_answer_correctness(question: Question, user_answer: any) -> bool:
    """Check if a user's answer is correct with strict validation"""
    if question.question_type == QuestionTypeEnum.SINGLE_CHOICE:
        # user_answer must be a valid integer index
        if not isinstance(user_answer, int):
            return False
        # Bounds check to prevent index out of range
        if user_answer < 0 or user_answer >= len(question.answer_options):
            return False
        correct_indices = [
            i for i, opt in enumerate(question.answer_options) if opt.get("is_correct")
        ]
        return user_answer in correct_indices

    if question.question_type == QuestionTypeEnum.MULTIPLE_CHOICE:
        # user_answer is a list of indices
        if not isinstance(user_answer, list):
            return False
        # Validate each index
        for idx in user_answer:
            if (
                not isinstance(idx, int)
                or idx < 0
                or idx >= len(question.answer_options)
            ):
                return False
        correct_indices = {
            i for i, opt in enumerate(question.answer_options) if opt.get("is_correct")
        }
        user_indices = set(user_answer)
        return correct_indices == user_indices

    if question.question_type == QuestionTypeEnum.TRUE_FALSE:
        # user_answer is 0 or 1 (True/False index)
        if not isinstance(user_answer, int):
            return False
        if user_answer < 0 or user_answer >= len(question.answer_options):
            return False
        correct_indices = [
            i for i, opt in enumerate(question.answer_options) if opt.get("is_correct")
        ]
        return user_answer in correct_indices

    if question.question_type == QuestionTypeEnum.MATCHING:
        # user_answer is a dict mapping left to right
        if not isinstance(user_answer, dict):
            return False
        # Validate all expected pairs are present
        expected_lefts = {
            opt.get("left") for opt in question.answer_options if opt.get("left")
        }
        if set(user_answer.keys()) != expected_lefts:
            return False
        # Check if all pairs match
        for option in question.answer_options:
            left = option.get("left")
            right = option.get("right")
            if not left or user_answer.get(left) != right:
                return False
        return True

    return False


async def mark_exam_complete(
    request: Request,
    activity_id: int,
    user_id: int,
    db_session: Session,
):
    """Mark exam activity as complete in trail steps"""
    # Find trail step for this activity and user
    statement = select(TrailStep).where(
        TrailStep.activity_id == activity_id,
        TrailStep.user_id == user_id,
    )
    trail_step = db_session.exec(statement).first()

    if trail_step:
        trail_step.complete = True
        trail_step.update_date = _utc_now_iso()
        db_session.add(trail_step)
        db_session.commit()


async def get_all_exam_attempts(
    request: Request,
    exam_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> list[dict]:
    """Get all exam attempts for teacher results dashboard"""
    # Get exam and verify permissions
    exam_statement = select(Exam).where(Exam.exam_uuid == exam_uuid)
    exam = db_session.exec(exam_statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # Get activity to check permissions
    activity_statement = select(Activity).where(Activity.id == exam.activity_id)
    activity = db_session.exec(activity_statement).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Активность не найдена")

    # Verify user is course contributor/teacher
    course = db_session.get(Course, activity.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")

    checker = PermissionChecker(db_session)
    has_rbac_access = checker.check(
        current_user.id,
        "exam:read",
        resource_owner_id=course.creator_id,
    )
    is_contributor = await is_course_contributor_or_admin(
        current_user.id, course, db_session
    )
    is_course_creator = bool(course.creator_id and course.creator_id == current_user.id)

    if not has_rbac_access and not is_contributor and not is_course_creator:
        raise PermissionDenied(permission="exam:read")

    # Joined query: fetch attempts + users in one query (fixes N+1)
    # Use == False for SQLAlchemy column comparison (not Python `not`)
    attempts_statement = (
        select(ExamAttempt, User)
        .join(User, User.id == ExamAttempt.user_id)
        .where(
            ExamAttempt.exam_id == exam.id,
            ExamAttempt.is_preview == False,
        )
        .order_by(ExamAttempt.started_at.desc())
    )
    rows = db_session.exec(attempts_statement).all()

    result = []
    for attempt, user in rows:
        # Calculate duration
        duration_seconds = None
        duration_minutes = None
        if attempt.submitted_at and attempt.started_at:
            try:
                start = datetime.fromisoformat(attempt.started_at)
                end = datetime.fromisoformat(attempt.submitted_at)
                total_seconds = int((end - start).total_seconds())
                duration_seconds = total_seconds
                duration_minutes = int(total_seconds / 60)
            except Exception:
                pass

        result.append({
            "attempt_uuid": attempt.attempt_uuid,
            "user_id": user.id,
            "user_name": (
                f"{getattr(user, 'first_name', '')} {getattr(user, 'middle_name', '')} {getattr(user, 'last_name', '')}".replace(
                    "  ", " "
                ).strip()
            )
            or user.username,
            "user_email": user.email,
            "started_at": attempt.started_at,
            "finished_at": attempt.submitted_at,
            "duration_minutes": duration_minutes,
            "duration_seconds": duration_seconds,
            "status": attempt.status,
            "score": attempt.score,
            "max_score": attempt.max_score,
            "percentage": round(
                (attempt.score / attempt.max_score * 100)
                if attempt.max_score and attempt.max_score > 0
                else 0,
                1,
            ),
            "violations": attempt.violations,
            "violation_count": len(attempt.violations) if attempt.violations else 0,
        })

    return result


async def export_questions_csv(
    request: Request,
    exam_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> str:
    """Export questions to CSV format"""
    # Get exam and verify permissions
    exam_statement = select(Exam).where(Exam.exam_uuid == exam_uuid)
    exam = db_session.exec(exam_statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # Get activity to check permissions
    activity_statement = select(Activity).where(Activity.id == exam.activity_id)
    activity = db_session.exec(activity_statement).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Активность не найдена")

    # Verify user is course contributor/teacher
    course = db_session.get(Course, activity.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(current_user.id, "exam:read")

    # Get questions
    questions_statement = (
        select(Question)
        .where(Question.exam_id == exam.id)
        .order_by(Question.order_index)
    )
    questions = db_session.exec(questions_statement).all()

    # Build CSV
    import csv
    import io

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "Текст вопроса",
        "Тип",
        "Баллы",
        "Варианты ответов (JSON)",
        "Пояснение",
        "Порядок",
    ])

    # Data
    import json

    for q in questions:
        writer.writerow([
            q.question_text,
            q.question_type,
            q.points,
            json.dumps(q.answer_options),
            q.explanation or "",
            q.order_index,
        ])

    return output.getvalue()


async def import_questions_csv(
    request: Request,
    exam_uuid: str,
    csv_content: str,
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """Import questions from CSV format"""
    # Get exam and verify permissions
    exam_statement = select(Exam).where(Exam.exam_uuid == exam_uuid)
    exam = db_session.exec(exam_statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # Get activity to check permissions
    activity_statement = select(Activity).where(Activity.id == exam.activity_id)
    activity = db_session.exec(activity_statement).first()

    if not activity:
        raise HTTPException(status_code=404, detail="Активность не найдена")

    # Verify user is course contributor/teacher
    course = db_session.get(Course, activity.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(current_user.id, "exam:create")

    # Parse CSV
    import csv
    import io
    import json

    csv_file = io.StringIO(csv_content)
    reader = csv.DictReader(csv_file)

    imported_count = 0
    errors = []

    # Get max order_index
    max_order_statement = (
        select(Question)
        .where(Question.exam_id == exam.id)
        .order_by(Question.order_index.desc())
    )
    max_question = db_session.exec(max_order_statement).first()
    next_order_index = (max_question.order_index + 1) if max_question else 0

    for row_num, row in enumerate(reader, start=2):  # Start at 2 to account for header
        try:
            # Support both English and Russian CSV headers
            question_text = (
                row.get("Question Text", "") or row.get("Текст вопроса", "")
            ).strip()
            question_type = (row.get("Type", "") or row.get("Тип", "")).strip()
            points = int(row.get("Points", 1) or row.get("Баллы", 1))
            answer_options_json = row.get("Answer Options (JSON)", "[]") or row.get(
                "Варианты ответов (JSON)", "[]"
            )
            explanation = (
                row.get("Explanation", "") or row.get("Пояснение", "")
            ).strip() or None

            # Validate
            if not question_text:
                errors.append(f"Строка {row_num}: Требуется текст вопроса")
                continue

            if question_type not in [
                "SINGLE_CHOICE",
                "MULTIPLE_CHOICE",
                "TRUE_FALSE",
                "MATCHING",
            ]:
                errors.append(
                    f"Строка {row_num}: Неверный тип вопроса '{question_type}'"
                )
                continue

            # Parse answer options
            try:
                answer_options = json.loads(answer_options_json)
            except json.JSONDecodeError:
                errors.append(f"Строка {row_num}: Неверный JSON в вариантах ответов")
                continue

            # Create question
            now = _utc_now_iso()
            new_question = Question(
                exam_id=exam.id,
                question_uuid=str(ULID()),
                question_text=question_text,
                question_type=question_type,
                points=points,
                answer_options=answer_options,
                explanation=explanation,
                order_index=next_order_index,
                creation_date=now,
                update_date=now,
            )

            db_session.add(new_question)
            imported_count += 1
            next_order_index += 1

        except Exception as e:
            errors.append(f"Строка {row_num}: {e!s}")

    db_session.commit()

    return {
        "imported": imported_count,
        "errors": errors,
        "total_rows": row_num - 1 if "row_num" in locals() else 0,
    }


async def reorder_questions(
    request: Request,
    exam_uuid: str,
    question_order: list[dict],
    current_user: PublicUser | AnonymousUser,
    db_session: Session,
) -> dict:
    """Bulk update question order for drag-and-drop reordering"""
    statement = select(Exam).where(Exam.exam_uuid == exam_uuid)
    exam = db_session.exec(statement).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Тест не найден")

    # RBAC check
    course = db_session.get(Course, exam.course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Курс не найден")
    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "exam:update",
        resource_owner_id=course.creator_id,
    )

    # Update order_index for each question
    updated_count = 0
    for item in question_order:
        question_uuid = item.get("question_uuid")
        new_order = item.get("order_index")

        if not question_uuid or new_order is None:
            continue

        question_statement = select(Question).where(
            Question.question_uuid == question_uuid
        )
        question = db_session.exec(question_statement).first()

        if question and question.exam_id == exam.id:
            question.order_index = new_order
            question.update_date = _utc_now_iso()
            updated_count += 1

    db_session.commit()

    return {"updated": updated_count, "total": len(question_order)}
