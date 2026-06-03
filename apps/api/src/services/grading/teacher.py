"""Teacher grading service."""

import csv
import io
import logging
from collections.abc import Generator
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import asc, desc, func, or_
from sqlmodel import Session, col, select
from ulid import ULID

from src.db.courses.activities import Activity
from src.db.gamification import XPSource
from src.db.grading.entries import GradingEntry
from src.db.grading.progress import AssessmentPolicy
from src.db.grading.schemas import (
    BatchGradeRequest,
    BatchGradeResponse,
    BatchGradeResultItem,
    BulkPublishGradesResponse,
)
from src.db.grading.submissions import (
    AssessmentType,
    GradedItem,
    GradingBreakdown,
    Submission,
    SubmissionListResponse,
    SubmissionRead,
    SubmissionStats,
    SubmissionStatus,
    SubmissionUser,
    TeacherGradeInput,
)
from src.db.users import PublicUser, User
from src.security.rbac import PermissionChecker
from src.services.progress.submissions import (
    _attach_policy,
    recalculate_activity_progress,
)

logger = logging.getLogger(__name__)


async def publish_grading_event(
    event_type: str,
    submission_uuid: str,
    payload: dict[str, Any] | None = None,
) -> None:
    """Надёжно поставить публикацию события оценки в очередь."""
    from src.worker.tasks.sse import publish_grading_event_task

    await publish_grading_event_task.kiq(event_type, submission_uuid, payload)


async def _award_xp_on_publish(
    *,
    submission_uuid: str,
    user_id: int,
    assessment_type: str,
) -> None:
    """Надёжно поставить в очередь побочные эффекты начисления XP для опубликованной отправки."""
    from src.worker.tasks.xp_award import award_xp_for_submission

    await award_xp_for_submission.kiq(
        submission_uuid=submission_uuid,
        user_id=user_id,
        assessment_type=assessment_type,
    )


# Valid status transitions a teacher may request.
# DRAFT is intentionally absent — teachers should never be able to revert
# a submitted submission to draft.
_ALLOWED_TEACHER_TRANSITIONS: dict[SubmissionStatus, frozenset[SubmissionStatus]] = {
    SubmissionStatus.PENDING: frozenset({
        SubmissionStatus.GRADED,
        SubmissionStatus.PUBLISHED,
        SubmissionStatus.RETURNED,
    }),
    SubmissionStatus.GRADED: frozenset({
        SubmissionStatus.GRADED,  # re-save is a no-op transition, always allowed
        SubmissionStatus.PUBLISHED,
        SubmissionStatus.RETURNED,
    }),
    SubmissionStatus.RETURNED: frozenset({
        SubmissionStatus.GRADED,
        SubmissionStatus.PENDING,
        SubmissionStatus.PUBLISHED,
    }),
    SubmissionStatus.PUBLISHED: frozenset({
        # Published grades are student-visible records. Corrections stay
        # published and write a new GradingEntry audit revision.
        SubmissionStatus.PUBLISHED,
    }),
}

# XP source for each assessment type — awarded when a grade is published.
_XP_SOURCE_ON_PUBLISH: dict[AssessmentType, XPSource] = {
    AssessmentType.QUIZ: XPSource.QUIZ_COMPLETION,
    AssessmentType.EXAM: XPSource.EXAM_COMPLETION,
    AssessmentType.CODE_CHALLENGE: XPSource.CODE_CHALLENGE_COMPLETION,
}

_SORT_MAP = {
    "submitted_at": col(Submission.submitted_at),
    "final_score": col(Submission.final_score),
    "created_at": col(Submission.created_at),
    "attempt_number": col(Submission.attempt_number),
}


async def get_submissions_for_activity(
    activity_id: int,
    current_user: PublicUser,
    db_session: Session,
    *,
    status_filter: str | None = None,
    late_only: bool = False,
    search: str | None = None,
    sort_by: str = "submitted_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 25,
) -> SubmissionListResponse:
    """Вернуть постраничные, фильтруемые и поисковые отправки для активности (вид преподавателя).

    Использует SQL LIMIT/OFFSET — без загрузки в память.
    """
    activity = db_session.exec(select(Activity).where(Activity.id == activity_id)).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Активность не найдена",
        )

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assessment:read",
        resource_owner_id=activity.creator_id,
    )

    # Base query — join User for search support
    query = (
        select(Submission).join(User, col(User.id) == Submission.user_id).where(Submission.activity_id == activity_id)
    )

    if status_filter:
        # "NEEDS_GRADING" — виртуальный фильтр, соответствующий PENDING
        if status_filter == "NEEDS_GRADING":
            query = query.where(Submission.status == SubmissionStatus.PENDING)
        else:
            try:
                query = query.where(Submission.status == SubmissionStatus(status_filter))
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Некорректный статус '{status_filter}'",
                )

    if late_only:
        query = query.where(Submission.is_late)

    if search:
        term = f"%{search}%"
        query = query.where(
            or_(
                col(User.first_name).ilike(term),
                col(User.last_name).ilike(term),
                col(User.username).ilike(term),
                col(User.email).ilike(term),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total: int = db_session.exec(count_query).one()

    sort_col = _SORT_MAP.get(sort_by, col(Submission.submitted_at))
    order_fn = desc if sort_dir == "desc" else asc
    query = query.order_by(order_fn(sort_col))

    offset = (page - 1) * page_size
    page_rows = db_session.exec(query.offset(offset).limit(page_size)).all()

    users_by_id = _batch_fetch_users({s.user_id for s in page_rows}, db_session)

    pages = max(1, -(-total // page_size))
    return SubmissionListResponse(
        items=[_enrich(s, users_by_id) for s in page_rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


async def get_submission_stats(
    activity_id: int,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionStats:
    """Return aggregate statistics for the teacher dashboard.

    Uses two SQL queries instead of five:
      1. Status counts (GROUP BY status)
      2. Scores for graded submissions (for avg/pass-rate)
    """
    activity = db_session.exec(select(Activity).where(Activity.id == activity_id)).first()
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Активность не найдена")

    checker = PermissionChecker(db_session)
    checker.require(current_user.id, "assessment:read", resource_owner_id=activity.creator_id)

    # Query 1: status counts (excludes DRAFTs)
    status_rows = db_session.exec(
        select(Submission.status, func.count().label("cnt"))
        .where(
            Submission.activity_id == activity_id,
            Submission.status != SubmissionStatus.DRAFT,
        )
        .group_by(Submission.status)
    ).all()

    status_counts: dict[SubmissionStatus, int] = {SubmissionStatus(row[0]): row[1] for row in status_rows}
    total = sum(status_counts.values())
    pending_count = status_counts.get(SubmissionStatus.PENDING, 0)
    graded_count = status_counts.get(SubmissionStatus.GRADED, 0) + status_counts.get(SubmissionStatus.PUBLISHED, 0)

    # Query 2: late count — all submitted (non-DRAFT) late submissions, regardless
    # of current status (graded/published late submissions still count as late).
    late_count: int = db_session.exec(
        select(func.count()).where(
            Submission.activity_id == activity_id,
            Submission.status != SubmissionStatus.DRAFT,
            Submission.is_late,
        )
    ).one()

    # Query 3 (small): scores for graded/published (for avg + pass rate)
    graded_scores_raw = db_session.exec(
        select(Submission.final_score).where(
            Submission.activity_id == activity_id,
            col(Submission.status).in_([
                SubmissionStatus.GRADED,
                SubmissionStatus.PUBLISHED,
            ]),
            col(Submission.final_score).is_not(None),
        )
    ).all()
    graded_scores = [float(s) for s in graded_scores_raw if s is not None]

    avg_score = round(sum(graded_scores) / len(graded_scores), 2) if graded_scores else None
    passing = [s for s in graded_scores if s >= 50.0]
    pass_rate = round(len(passing) / len(graded_scores) * 100, 1) if graded_scores else None

    return SubmissionStats(
        total=total,
        graded_count=graded_count,
        needs_grading_count=pending_count,
        late_count=late_count,
        avg_score=avg_score,
        pass_rate=pass_rate,
    )


async def get_submission_for_teacher(
    submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> SubmissionRead:
    """Получить одну отправку с полными ответами и детализацией оценивания.

    Требует права assessment:read, ограниченного создателем активности,
    чтобы исключить утечку данных между активностями и курсами.
    """
    submission = db_session.exec(select(Submission).where(Submission.submission_uuid == submission_uuid)).first()
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Отправка не найдена")

    activity = db_session.exec(select(Activity).where(Activity.id == submission.activity_id)).first()
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Активность не найдена")

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assessment:read",
        resource_owner_id=activity.creator_id,
    )

    result = SubmissionRead.model_validate(submission)
    users_by_id = _batch_fetch_users({submission.user_id}, db_session)
    user = users_by_id.get(submission.user_id)
    if user:
        result.user = _make_submission_user(user)
    return result


def export_grades_csv(
    activity_id: int,
    current_user: PublicUser,
    db_session: Session,
    *,
    assessment_type_filter: str | None = None,
    submitted_after: datetime | None = None,
    submitted_before: datetime | None = None,
) -> Generator[str]:
    """Потоково отдавать CSV-строки всех отправок, кроме черновиков, по одному батчу за раз.

    Сначала возвращает строку заголовков, затем строки батчами по 200,
    чтобы ответ начинался сразу и использование памяти оставалось
    ограниченным независимо от размера группы. Использует модуль csv
    для безопасного экранирования.

    Необязательные фильтры:
    - ``assessment_type_filter``: ограничить конкретным значением ``AssessmentType``.
    - ``submitted_after``: включать только отправки после этой даты и времени.
    - ``submitted_before``: включать только отправки до этой даты и времени.
    """
    activity = db_session.exec(select(Activity).where(Activity.id == activity_id)).first()
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Активность не найдена")

    checker = PermissionChecker(db_session)
    checker.require(current_user.id, "assessment:read", resource_owner_id=activity.creator_id)

    buf = io.StringIO()
    writer = csv.writer(buf)

    # Discover item columns from the first graded submission's breakdown
    item_headers: list[str] = []
    sample_submission = db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity_id,
            Submission.status != SubmissionStatus.DRAFT,
            col(Submission.grading_json).is_not(None),
        )
    ).first()
    if sample_submission and isinstance(sample_submission.grading_json, dict):
        items = sample_submission.grading_json.get("items", [])
        for item in items:
            if isinstance(item, dict):
                item_id = item.get("item_id", "")
                item_text = item.get("item_text", item_id)
                item_headers.append(item_text or item_id)

    header = [
        "Имя студента",
        "Электронная почта",
        "Попытка",
        "Статус",
        "Опоздание",
        "Отправлено",
        "Автоматический балл",
        "Итоговый балл",
    ] + [f"Элемент: {h}" for h in item_headers]

    writer.writerow(header)
    yield buf.getvalue()
    buf.truncate(0)
    buf.seek(0)

    # Build dynamic WHERE conditions for optional filters.
    base_conditions: list[Any] = [
        Submission.activity_id == activity_id,
        Submission.status != SubmissionStatus.DRAFT,
    ]
    if assessment_type_filter is not None:
        base_conditions.append(Submission.assessment_type == assessment_type_filter)
    if submitted_after is not None:
        base_conditions.append(col(Submission.submitted_at) >= submitted_after)
    if submitted_before is not None:
        base_conditions.append(col(Submission.submitted_at) <= submitted_before)

    query = (
        select(Submission, User)
        .join(User, col(User.id) == Submission.user_id)
        .where(*base_conditions)
        .order_by(asc(col(Submission.submitted_at)))
    )

    for s, u in db_session.exec(query).yield_per(200):
        parts = [p for p in [u.first_name, u.middle_name, u.last_name] if p]
        name = " ".join(parts) if parts else u.username
        email = str(u.email)

        submitted = s.submitted_at.isoformat() if s.submitted_at else ""

        # Extract per-item scores from grading breakdown
        item_scores: list[str] = []
        if item_headers and isinstance(s.grading_json, dict):
            items = s.grading_json.get("items", [])
            scores_by_id = {item.get("item_id", ""): item.get("score", "") for item in items if isinstance(item, dict)}
            # Match order from header discovery
            if sample_submission and isinstance(sample_submission.grading_json, dict):
                for item in sample_submission.grading_json.get("items", []):
                    if isinstance(item, dict):
                        item_id = item.get("item_id", "")
                        item_scores.append(str(scores_by_id.get(item_id, "")))
        elif item_headers:
            item_scores = [""] * len(item_headers)

        writer.writerow([
            name,
            email,
            s.attempt_number,
            s.status,
            "да" if s.is_late else "нет",
            submitted,
            s.auto_score if s.auto_score is not None else "",
            s.final_score if s.final_score is not None else "",
            *item_scores,
        ])
        yield buf.getvalue()
        buf.truncate(0)
        buf.seek(0)


async def save_grade(
    submission_uuid: str,
    grade_input: TeacherGradeInput,
    current_user: PublicUser,
    db_session: Session,
    *,
    expected_version: int | None = None,
) -> SubmissionRead:
    """Сохранить оценку, введённую преподавателем, после проверки доступа.

    Передайте ``expected_version`` (из заголовка ``If-Match``), чтобы включить
    оптимистичный контроль конкурентного доступа. Если отправка была изменена
    после того, как преподаватель её открыл, возвращается 412 Precondition Failed.
    """
    submission, activity = _get_submission_with_activity(submission_uuid, db_session)

    checker = PermissionChecker(db_session)
    checker.require(
        current_user.id,
        "assessment:grade",
        resource_owner_id=activity.creator_id,
    )

    return await _save_teacher_grade(
        submission=submission,
        grade_input=grade_input,
        submission_uuid=submission_uuid,
        current_user=current_user,
        db_session=db_session,
        expected_version=expected_version,
    )


async def batch_grade_submissions(
    batch_request: BatchGradeRequest,
    current_user: PublicUser,
    db_session: Session,
) -> BatchGradeResponse:
    """Применить оценки преподавателя к нескольким отправкам одним атомарным запросом.

    Семантика all-or-nothing: сначала проверяется каждая отправка. Если хотя бы
    одна проверка не проходит, **ни одна** оценка не записывается, а ошибка
    возвращается для проблемного элемента. Только после прохождения всех
    проверок изменения применяются одним коммитом.

    Размер пакета ограничен 50 отправками за запрос.
    """
    BATCH_CAP = 50
    if len(batch_request.grades) > BATCH_CAP:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "BATCH_SIZE_EXCEEDED",
                "message": f"Пакетное оценивание поддерживает не более {BATCH_CAP} отправок за один запрос.",
                "limit": BATCH_CAP,
                "provided": len(batch_request.grades),
            },
        )

    requested_uuids = [grade.submission_uuid for grade in batch_request.grades]
    rows = db_session.exec(
        select(Submission, Activity)
        .join(Activity, col(Activity.id) == Submission.activity_id)
        .where(col(Submission.submission_uuid).in_(requested_uuids))
    ).all()

    submissions_by_uuid = {submission.submission_uuid: (submission, activity) for submission, activity in rows}
    checker = PermissionChecker(db_session)

    # ── Phase 1: Pre-validate ALL items ──────────────────────────────────────
    validation_errors: list[BatchGradeResultItem] = []

    for grade in batch_request.grades:
        row = submissions_by_uuid.get(grade.submission_uuid)
        if row is None:
            validation_errors.append(
                BatchGradeResultItem(
                    submission_uuid=grade.submission_uuid,
                    success=False,
                    error="Отправка не найдена",
                )
            )
            continue

        _, activity = row
        if not checker.check(
            current_user.id,
            "assessment:grade",
            resource_owner_id=activity.creator_id,
        ):
            validation_errors.append(
                BatchGradeResultItem(
                    submission_uuid=grade.submission_uuid,
                    success=False,
                    error="Нет прав на оценивание этой отправки",
                )
            )

    if validation_errors:
        # Return failures without writing anything.
        all_results = []
        error_uuids = {e.submission_uuid for e in validation_errors}
        for grade in batch_request.grades:
            if grade.submission_uuid in error_uuids:
                all_results.append(next(e for e in validation_errors if e.submission_uuid == grade.submission_uuid))
            else:
                all_results.append(
                    BatchGradeResultItem(
                        submission_uuid=grade.submission_uuid,
                        success=False,
                        error="Отменено — пакет содержит некорректные элементы",
                    )
                )
        return BatchGradeResponse(
            results=all_results,
            succeeded=0,
            failed=len(all_results),
        )

    # ── Phase 2: Apply all changes (no more validation errors) ───────────────
    results: list[BatchGradeResultItem] = []
    succeeded = 0
    failed = 0

    for grade in batch_request.grades:
        submission, _ = submissions_by_uuid[grade.submission_uuid]
        try:
            grade_input = TeacherGradeInput(
                final_score=grade.final_score,
                status=grade.status,
                feedback=grade.feedback or "",
                item_feedback=grade.item_feedback or [],
            )
            await _save_teacher_grade(
                submission=submission,
                grade_input=grade_input,
                submission_uuid=grade.submission_uuid,
                current_user=current_user,
                db_session=db_session,
            )
            results.append(
                BatchGradeResultItem(
                    submission_uuid=grade.submission_uuid,
                    success=True,
                )
            )
            succeeded += 1
        except Exception as exc:
            # Unexpected error — roll back everything and return.
            db_session.rollback()
            error_msg = _stringify_http_exception_detail(exc.detail) if isinstance(exc, HTTPException) else str(exc)
            logger.exception(
                "Непредвиденный сбой пакетного оценивания для отправки %s",
                grade.submission_uuid,
            )
            abort_results = list(results)
            abort_results.extend(
                BatchGradeResultItem(
                    submission_uuid=pending.submission_uuid,
                    success=False,
                    error="Отменено из-за предыдущей ошибки",
                )
                for pending in batch_request.grades[len(results) :]
            )
            # Mark the failing item
            abort_results[len(results) - 1] = BatchGradeResultItem(
                submission_uuid=grade.submission_uuid,
                success=False,
                error=error_msg,
            )
            return BatchGradeResponse(
                results=abort_results,
                succeeded=0,
                failed=len(abort_results),
            )

    return BatchGradeResponse(results=results, succeeded=succeeded, failed=failed)


async def _save_teacher_grade(
    *,
    submission: Submission,
    grade_input: TeacherGradeInput,
    submission_uuid: str,
    current_user: PublicUser,
    db_session: Session,
    expected_version: int | None = None,
) -> SubmissionRead:
    """Сохранить оценку, введённую преподавателем, после проверки доступа.

    Гарантия атомарности: обновление отправки, ActivityProgress и CourseProgress
    фиксируются внутри одного ``db_session.commit()``. Если любой шаг падает,
    вся операция откатывается.

    Оптимистичная блокировка: если ``expected_version`` задан и не совпадает с
    ``submission.version``, вызывается 412 Precondition Failed, чтобы показать
    наличие параллельного изменения.
    """
    # ── Optimistic lock check ─────────────────────────────────────────────────
    if expected_version is not None and submission.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_412_PRECONDITION_FAILED,
            detail=(
                f"Отправка была изменена одновременно (версия {submission.version}). "
                "Обновите страницу и повторите попытку."
            ),
        )

    # ── State machine validation ──────────────────────────────────────────────
    requested_status = SubmissionStatus(grade_input.status)
    current_status = submission.status

    if requested_status != current_status:
        allowed = _ALLOWED_TEACHER_TRANSITIONS.get(current_status, frozenset())
        if requested_status not in allowed:
            logger.warning(
                "Некорректный переход статуса оценки от %s к %s для отправки %s",
                current_status,
                requested_status,
                submission_uuid,
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Нельзя перейти из {current_status} в {requested_status}. "
                    f"Разрешённые переходы: {[s.value for s in allowed]}"
                ),
            )

    # ── Merge item feedback into grading breakdown ────────────────────────────
    existing = GradingBreakdown.model_validate(submission.grading_json or {})
    item_map = {item.item_id: item for item in existing.items}

    for item_fb in grade_input.item_feedback:
        if item_fb.item_id in item_map:
            update: dict[str, Any] = {}
            if item_fb.score is not None:
                update["score"] = item_fb.score
                update["needs_manual_review"] = False
            if item_fb.feedback:
                update["feedback"] = item_fb.feedback
            if update:
                item_map[item_fb.item_id] = item_map[item_fb.item_id].model_copy(update=update)
        else:
            item_map[item_fb.item_id] = GradedItem(
                item_id=item_fb.item_id,
                score=item_fb.score or 0.0,
                max_score=0.0,
                feedback=item_fb.feedback,
            )

    still_needs_review = any(item.needs_manual_review and not item.feedback for item in item_map.values())
    updated_grading = GradingBreakdown(
        items=list(item_map.values()),
        needs_manual_review=still_needs_review,
        auto_graded=existing.auto_graded,
        feedback=grade_input.feedback,
    )

    # ── Apply all writes and commit atomically ────────────────────────────────
    now = datetime.now(UTC)
    raw_score = float(grade_input.final_score)
    penalty_pct = float(submission.late_penalty_pct or 0)
    final_score = round(raw_score * (1 - min(100.0, max(0.0, penalty_pct)) / 100), 2)

    raw_breakdown = (
        submission.raw_grading_json
        if getattr(submission, "raw_grading_json", None) is not None
        else submission.grading_json
        if getattr(submission, "grading_json", None) is not None
        else {}
    )
    effective_breakdown = updated_grading.model_dump()

    submission.final_score = final_score
    submission.status = requested_status
    submission.grading_json = effective_breakdown
    submission.graded_at = now
    submission.updated_at = now
    submission.version += 1  # bump optimistic lock version

    # Ensure the assessment policy is attached before progress recalculation.
    _attach_policy(submission, db_session)
    db_session.add(submission)
    if submission.id is not None:
        db_session.add(
            GradingEntry(
                entry_uuid=f"entry_{ULID()}",
                submission_id=submission.id,
                graded_by=current_user.id,
                raw_score=raw_score,
                penalty_pct=penalty_pct,
                final_score=final_score,
                breakdown=effective_breakdown,
                raw_breakdown=raw_breakdown,
                effective_breakdown=effective_breakdown,
                overall_feedback=grade_input.feedback,
                grading_version=submission.grading_version,
                created_at=now,
                published_at=(now if requested_status == SubmissionStatus.PUBLISHED else None),
            )
        )

    # Recalculate ActivityProgress + CourseProgress in the same transaction.
    recalculate_activity_progress(
        submission.activity_id,
        submission.user_id,
        db_session,
        commit=False,  # we commit below — all three tables in one transaction
    )

    db_session.commit()
    db_session.refresh(submission)

    # ── Post-commit side-effects (durable, via taskiq) ────────────────────────
    # Enqueued AFTER the DB commit so a queue failure never rolls back a grade.
    # Each task is idempotent — replaying is always safe.
    if (
        current_status != SubmissionStatus.PUBLISHED
        and requested_status == SubmissionStatus.PUBLISHED
        and final_score >= _policy_passing_score_for_submission(submission, db_session)
    ):
        from src.worker.tasks.xp_award import award_xp_for_submission

        await award_xp_for_submission.kiq(
            submission_uuid=submission_uuid,
            user_id=submission.user_id,
            assessment_type=str(submission.assessment_type),
        )

    if requested_status == SubmissionStatus.PUBLISHED:
        from src.worker.tasks.sse import publish_grading_event_task

        await publish_grading_event_task.kiq(
            "grade.published",
            submission_uuid,
            {
                "submission_uuid": submission_uuid,
                "final_score": final_score,
                "published_at": now.isoformat(),
            },
        )
    elif requested_status == SubmissionStatus.RETURNED:
        from src.worker.tasks.sse import publish_grading_event_task

        await publish_grading_event_task.kiq(
            "submission.returned",
            submission_uuid,
            {
                "submission_uuid": submission_uuid,
                "feedback": grade_input.feedback,
                "returned_at": now.isoformat(),
            },
        )

    return SubmissionRead.model_validate(submission)


async def bulk_publish_grades(
    activity_id: int,
    current_user: PublicUser,
    db_session: Session,
) -> BulkPublishGradesResponse:
    """Опубликовать все оценённые отправки для активности сразу (режим BATCH).

    Для каждой отправки в статусе PUBLISHED, у которой ещё нет строки GradingEntry
    с заполненным published_at, вставляется новая неизменяемая запись GradingEntry
    с published_at, равным текущему времени. Это делает оценку видимой на
    студенческом endpoint.

    Возвращает количество опубликованных оценок и уже видимых.
    """
    activity = db_session.exec(select(Activity).where(Activity.id == activity_id)).first()
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Активность не найдена")

    checker = PermissionChecker(db_session)
    checker.require(current_user.id, "assessment:grade", resource_owner_id=activity.creator_id)

    # All graded submissions for this activity
    submissions = db_session.exec(
        select(Submission).where(
            Submission.activity_id == activity_id,
            col(Submission.status).in_([
                SubmissionStatus.GRADED,
                SubmissionStatus.PUBLISHED,
            ]),
            col(Submission.id).is_not(None),
        )
    ).all()

    if not submissions:
        return BulkPublishGradesResponse(
            activity_id=activity_id,
            published_count=0,
            already_published_count=0,
        )

    # Which submission IDs already have a published GradingEntry?
    submission_ids = [s.id for s in submissions if s.id is not None]
    already_published_ids: set[int] = set(
        db_session.exec(
            select(GradingEntry.submission_id).where(
                col(GradingEntry.submission_id).in_(submission_ids),
                col(GradingEntry.published_at).is_not(None),
            )
        ).all()
    )

    now = datetime.now(UTC)

    # Batch-fetch the latest GradingEntry per unpublished submission in one query
    # instead of issuing N separate queries (N+1 pattern).
    unpublished_ids = [s.id for s in submissions if s.id not in already_published_ids and s.id is not None]
    latest_entries_by_submission: dict[int, GradingEntry] = {}
    if unpublished_ids:
        from sqlalchemy import func as sql_func

        # Subquery: max id per submission (proxy for most-recent entry)
        subq = (
            select(sql_func.max(GradingEntry.id).label("max_id"))
            .where(col(GradingEntry.submission_id).in_(unpublished_ids))
            .group_by(col(GradingEntry.submission_id))
            .subquery()
        )
        latest_rows = db_session.exec(select(GradingEntry).where(col(GradingEntry.id).in_(select(subq.c.max_id)))).all()
        for row in latest_rows:
            if row.submission_id is not None:
                latest_entries_by_submission[row.submission_id] = row

    published_count = 0
    for submission in submissions:
        if submission.id is None or submission.id in already_published_ids:
            continue

        latest_entry = latest_entries_by_submission.get(submission.id)
        raw_breakdown = (
            latest_entry.raw_breakdown
            if latest_entry is not None and getattr(latest_entry, "raw_breakdown", None) is not None
            else submission.raw_grading_json
            if getattr(submission, "raw_grading_json", None) is not None
            else {}
        )
        effective_breakdown = (
            latest_entry.effective_breakdown
            if latest_entry is not None and getattr(latest_entry, "effective_breakdown", None) is not None
            else submission.grading_json
            if getattr(submission, "grading_json", None) is not None
            else {}
        )

        entry = GradingEntry(
            entry_uuid=f"entry_{ULID()}",
            submission_id=submission.id,
            graded_by=current_user.id,
            raw_score=float(
                latest_entry.raw_score
                if latest_entry is not None
                else submission.final_score or submission.auto_score or 0
            ),
            penalty_pct=float(
                latest_entry.penalty_pct if latest_entry is not None else submission.late_penalty_pct or 0
            ),
            final_score=float(
                latest_entry.final_score
                if latest_entry is not None
                else submission.final_score or submission.auto_score or 0
            ),
            breakdown=effective_breakdown,
            raw_breakdown=raw_breakdown,
            effective_breakdown=effective_breakdown,
            overall_feedback=(
                latest_entry.overall_feedback
                if latest_entry is not None and latest_entry.overall_feedback is not None
                else effective_breakdown.get("feedback", "")
            ),
            grading_version=submission.grading_version,
            created_at=now,
            published_at=now,
        )
        db_session.add(entry)
        submission.status = SubmissionStatus.PUBLISHED
        submission.final_score = entry.final_score
        submission.updated_at = now
        db_session.add(submission)
        recalculate_activity_progress(
            submission.activity_id,
            submission.user_id,
            db_session,
            commit=False,
        )
        published_count += 1

    if published_count:
        db_session.commit()
        from src.worker.tasks.sse import publish_grading_event_task

        for submission in submissions:
            if submission.id in already_published_ids:
                continue
            await publish_grading_event_task.kiq(
                "grade.published",
                submission.submission_uuid,
                {
                    "submission_uuid": submission.submission_uuid,
                    "final_score": submission.final_score,
                    "published_at": now.isoformat(),
                },
            )

    return BulkPublishGradesResponse(
        activity_id=activity_id,
        published_count=published_count,
        already_published_count=len(already_published_ids),
    )


def _get_submission_with_activity(
    submission_uuid: str,
    db_session: Session,
) -> tuple[Submission, Activity]:
    row = db_session.exec(
        select(Submission, Activity)
        .join(Activity, col(Activity.id) == Submission.activity_id)
        .where(col(Submission.submission_uuid) == submission_uuid)
    ).first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Отправка не найдена",
        )
    return row


def _stringify_http_exception_detail(detail: object) -> str:
    if isinstance(detail, dict):
        message = detail.get("message")
        if isinstance(message, str) and message:
            return message
        return str(detail)
    if isinstance(detail, list):
        return "; ".join(str(item) for item in detail)
    return str(detail)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _batch_fetch_users(user_ids: set[int], db_session: Session) -> dict[int, User]:
    if not user_ids:
        return {}
    rows = db_session.exec(select(User).where(col(User.id).in_(user_ids))).all()
    return {u.id: u for u in rows if u.id is not None}


def _make_submission_user(u: User) -> SubmissionUser:
    return SubmissionUser(
        id=u.id,
        username=u.username,
        first_name=u.first_name or None,
        last_name=u.last_name or None,
        middle_name=u.middle_name or None,
        email=str(u.email),
        avatar_image=u.avatar_image or None,
        user_uuid=u.user_uuid or None,
    )


def _enrich(s: Submission, users_by_id: dict[int, User]) -> SubmissionRead:
    base = SubmissionRead.model_validate(s)
    user = users_by_id.get(s.user_id)
    if user:
        base.user = _make_submission_user(user)
    return base


def _policy_passing_score_for_submission(
    submission: Submission,
    db_session: Session,
) -> float:
    policy = None
    if submission.assessment_policy_id is not None:
        policy = db_session.get(AssessmentPolicy, submission.assessment_policy_id)
    if policy is None:
        policy = db_session.exec(
            select(AssessmentPolicy).where(AssessmentPolicy.activity_id == submission.activity_id)
        ).first()
    return float(policy.passing_score) if policy is not None else 60.0
