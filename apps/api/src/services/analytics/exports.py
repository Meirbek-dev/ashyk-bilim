from __future__ import annotations

import csv
import io
from collections.abc import Iterable, Iterator

from sqlmodel import Session

from src.services.analytics.assessments import build_assessment_rows
from src.services.analytics.filters import AnalyticsFilters
from src.services.analytics.queries import (
    assignment_is_reviewable,
    assignment_submission_status,
    assignment_submitted_at,
    cohort_user_ids,
    load_analytics_context,
    progress_snapshots,
)
from src.services.analytics.risk import build_risk_rows
from src.services.analytics.scope import TeacherAnalyticsScope

MAX_EXPORT_ROWS = 50_000

RISK_LEVEL_LABELS_RU = {
    "low": "Низкий",
    "medium": "Средний",
    "high": "Высокий",
}

REASON_CODE_LABELS_RU = {
    "inactive_7d": "Нет активности 7 дней",
    "low_progress": "Низкий прогресс",
    "repeated_failures": "Повторяющиеся неудачи",
    "missing_required_assessments": "Пропущены обязательные оценивания",
    "grading_block": "Блокировка из-за проверки",
    "low_submission_rate": "Низкая доля отправок",
    "low_success_rate": "Низкая доля успешных попыток",
    "slow_feedback": "Медленная обратная связь",
    "low_pass_rate": "Низкая доля прохождения",
    "grading_latency": "Задержка проверки",
    "low_completion_rate": "Низкая доля завершения",
    "below_threshold": "Ниже проходного порога",
    "low_accuracy": "Низкая точность",
}

ASSESSMENT_TYPE_LABELS_RU = {
    "assignment": "Задание",
    "quiz": "Тест",
    "exam": "Экзамен",
    "code_challenge": "Задача по коду",
}

STATUS_LABELS_RU = {
    "PENDING": "В ожидании",
    "SUBMITTED": "Отправлено",
    "GRADED": "Проверено",
    "LATE": "Просрочено",
    "NOT_SUBMITTED": "Не отправлено",
    "IN_PROGRESS": "В процессе",
    "AUTO_SUBMITTED": "Автоотправка",
    "COMPLETED": "Завершено",
    "FAILED": "Ошибка",
    "PROCESSING": "Обрабатывается",
    "PENDING_JUDGE0": "Ожидает Judge0",
}


def _reason_codes_ru(reason_codes: list[str]) -> str:
    return ";".join(REASON_CODE_LABELS_RU.get(code, code) for code in reason_codes)


def _status_ru(status: str) -> str:
    return STATUS_LABELS_RU.get(status, status)


def _csv_string(headers: list[str], rows: list[list[object]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows[:MAX_EXPORT_ROWS])
    return output.getvalue()


def _csv_stream(headers: list[str], rows: Iterable[list[object]]) -> Iterator[str]:
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(headers)
    yield output.getvalue()
    output.seek(0)
    output.truncate(0)

    for index, row in enumerate(rows):
        if index >= MAX_EXPORT_ROWS:
            break
        writer.writerow(row)
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)


def export_at_risk_csv(
    db_session: Session, scope: TeacherAnalyticsScope, filters: AnalyticsFilters
) -> Iterator[str]:
    context = load_analytics_context(db_session, scope.course_ids)
    rows = build_risk_rows(context, filters)
    return _csv_stream(
        [
            "id_пользователя",
            "имя_пользователя",
            "id_курса",
            "название_курса",
            "прогресс_проц",
            "дней_с_последней_активности",
            "балл_риска",
            "уровень_риска",
            "причины",
            "рекомендуемое_действие",
        ],
        [
            [
                row.user_id,
                row.user_display_name,
                row.course_id,
                row.course_name,
                row.progress_pct,
                row.days_since_last_activity,
                row.risk_score,
                RISK_LEVEL_LABELS_RU.get(row.risk_level, row.risk_level),
                _reason_codes_ru(row.reason_codes),
                row.recommended_action,
            ]
            for row in rows
        ],
    )


def export_grading_backlog_csv(
    db_session: Session, scope: TeacherAnalyticsScope, filters: AnalyticsFilters
) -> Iterator[str]:
    context = load_analytics_context(db_session, scope.course_ids)
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)

    def row_iter() -> Iterator[list[object]]:
        for submission, assignment in context.assignment_submissions:
            if not assignment_is_reviewable(submission):
                continue
            if (
                allowed_user_ids is not None
                and submission.user_id not in allowed_user_ids
            ):
                continue
            user = context.users_by_id.get(submission.user_id)
            course = context.courses_by_id.get(assignment.course_id)
            yield [
                submission.user_id,
                user.username if user else "Неизвестно",
                assignment.course_id,
                course.name
                if course is not None
                else f"Удаленный курс #{assignment.course_id}",
                assignment.id,
                assignment.title,
                _status_ru(assignment_submission_status(submission)),
                assignment_submitted_at(submission),
            ]

    return _csv_stream(
        [
            "id_пользователя",
            "имя_пользователя",
            "id_курса",
            "название_курса",
            "id_задания",
            "название_задания",
            "статус",
            "отправлено_в",
        ],
        row_iter(),
    )


def export_course_progress_csv(
    db_session: Session, scope: TeacherAnalyticsScope, filters: AnalyticsFilters
) -> Iterator[str]:
    context = load_analytics_context(db_session, scope.course_ids)
    allowed_user_ids = cohort_user_ids(context, filters.cohort_ids)
    snapshots = progress_snapshots(context, allowed_user_ids)

    def row_iter() -> Iterator[list[object]]:
        for snapshot in snapshots.values():
            yield [
                snapshot.course_id,
                context.courses_by_id[snapshot.course_id].name,
                snapshot.user_id,
                (
                    context.users_by_id[snapshot.user_id].username
                    if snapshot.user_id in context.users_by_id
                    else "Неизвестно"
                ),
                snapshot.progress_pct,
                snapshot.completed_steps,
                snapshot.total_steps,
                snapshot.last_activity_at.isoformat()
                if snapshot.last_activity_at
                else None,
                "Да" if snapshot.has_certificate else "Нет",
            ]

    return _csv_stream(
        [
            "id_курса",
            "название_курса",
            "id_пользователя",
            "имя_пользователя",
            "прогресс_проц",
            "завершенные_шаги",
            "всего_шагов",
            "последняя_активность",
            "есть_сертификат",
        ],
        row_iter(),
    )


def export_assessment_outcomes_csv(
    db_session: Session, scope: TeacherAnalyticsScope, filters: AnalyticsFilters
) -> Iterator[str]:
    context = load_analytics_context(db_session, scope.course_ids)
    rows = build_assessment_rows(context, filters)
    return _csv_stream(
        [
            "тип_оценивания",
            "id_оценивания",
            "id_курса",
            "название_курса",
            "название",
            "доля_отправок",
            "доля_прохождения",
            "медианный_балл",
            "сложность",
            "сигналы",
        ],
        (
            [
                ASSESSMENT_TYPE_LABELS_RU.get(row.assessment_type, row.assessment_type),
                row.assessment_id,
                row.course_id,
                row.course_name,
                row.title,
                row.submission_rate,
                row.pass_rate,
                row.median_score,
                row.difficulty_score,
                _reason_codes_ru(row.outlier_reason_codes),
            ]
            for row in rows
        ),
    )
