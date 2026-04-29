"""Convert legacy quiz assignments into exam activities.

Each ``AssignmentTask`` of type ``QUIZ`` is migrated into a fresh
``TYPE_EXAM`` activity with a matching ``Exam`` row and ``Question`` rows,
preserving the quiz's questions and (best-effort) settings. After the
conversion finishes:

  * The legacy QUIZ ``assignmenttask`` rows are deleted.
  * Any ``assignment`` left with **zero** remaining tasks is deleted along
    with its source activity (Postgres cascades drop the assignment, its
    submissions, and any related canonical/progress rows for that activity).

Mixed assignments (QUIZ + non-QUIZ tasks) keep the parent assignment plus
its non-QUIZ tasks; only the QUIZ tasks are removed.

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-04-29
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from alembic import op
from ulid import ULID

revision: str = "e5f6g7h8i9j0"
down_revision: str | Sequence[str] | None = "d4e5f6g7h8i9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ── Generic helpers ────────────────────────────────────────────────────────────


def _json_value(value: Any, default: Any) -> Any:
    """Normalise JSON column values that may surface as dicts or strings."""
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        if not value.strip():
            return default
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return default
    return value


def _fetch_all(conn, sql: str, **params: Any) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute(sa.text(sql), params).mappings()]


def _fetch_one(conn, sql: str, **params: Any) -> dict[str, Any] | None:
    row = conn.execute(sa.text(sql), params).mappings().first()
    return dict(row) if row else None


def _next_activity_order(conn, chapter_id: int) -> int:
    row = _fetch_one(
        conn,
        'SELECT COALESCE(MAX("order"), -1) + 1 AS next_order '
        "FROM activity WHERE chapter_id = :chapter_id",
        chapter_id=chapter_id,
    )
    return int(row["next_order"] if row else 0)


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


# ── Quiz settings → Exam settings mapping ─────────────────────────────────────

# Bounds mirror src.db.courses.exams.ExamSettingsBase validators so the JSON
# we write here matches the runtime-validated shape exactly.
_TIME_LIMIT_MIN, _TIME_LIMIT_MAX = 1, 180
_ATTEMPT_LIMIT_MIN, _ATTEMPT_LIMIT_MAX = 1, 5
_VIOLATION_THRESHOLD_MIN, _VIOLATION_THRESHOLD_MAX = 1, 10


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


def _map_quiz_settings(quiz_settings: dict[str, Any]) -> dict[str, Any]:
    """AssignmentQuizTaskSettings → ExamSettingsBase JSON."""
    quiz_settings = quiz_settings or {}

    # time_limit_seconds (int seconds) → time_limit (int minutes, 1..180)
    time_limit_seconds = quiz_settings.get("time_limit_seconds")
    time_limit_minutes: int | None = None
    if isinstance(time_limit_seconds, (int, float)) and time_limit_seconds > 0:
        time_limit_minutes = _clamp(
            round(time_limit_seconds / 60),
            _TIME_LIMIT_MIN,
            _TIME_LIMIT_MAX,
        )

    # max_attempts → attempt_limit (1..5)
    max_attempts = quiz_settings.get("max_attempts")
    if isinstance(max_attempts, int) and max_attempts > 0:
        attempt_limit: int | None = _clamp(
            max_attempts, _ATTEMPT_LIMIT_MIN, _ATTEMPT_LIMIT_MAX
        )
    else:
        # Quiz default was None=unlimited; exam default is 1.
        attempt_limit = 1

    # max_violations → violation_threshold (1..10), but only when violation
    # tracking + auto-block were enabled on the quiz side.
    max_violations = quiz_settings.get("max_violations")
    track_violations = bool(quiz_settings.get("track_violations", True))
    block_on_violations = bool(quiz_settings.get("block_on_violations", True))
    if (
        track_violations
        and block_on_violations
        and isinstance(max_violations, int)
        and max_violations > 0
    ):
        violation_threshold: int | None = _clamp(
            max_violations,
            _VIOLATION_THRESHOLD_MIN,
            _VIOLATION_THRESHOLD_MAX,
        )
    else:
        violation_threshold = None

    return {
        "time_limit": time_limit_minutes,
        "attempt_limit": attempt_limit,
        "shuffle_questions": True,
        "shuffle_answers": True,
        "question_limit": None,
        "access_mode": "ALL_ENROLLED",
        "whitelist_user_ids": [],
        "allow_result_review": True,
        "show_correct_answers": True,
        "passing_score": 60,
        "copy_paste_protection": bool(quiz_settings.get("prevent_copy", True)),
        "tab_switch_detection": False,
        "devtools_detection": False,
        "right_click_disable": False,
        "fullscreen_enforcement": False,
        "violation_threshold": violation_threshold,
        "lifecycle_status": "DRAFT",
        "scheduled_at": None,
        "published_at": None,
        "archived_at": None,
    }


def _map_quiz_question(
    question_config: dict[str, Any],
    order_index: int,
) -> dict[str, Any] | None:
    """AssignmentQuizQuestionConfig → Question row payload (or None to skip)."""
    raw_text = question_config.get("questionText") or ""
    question_text = str(raw_text).strip()
    if not question_text:
        return None

    raw_options = question_config.get("options") or []
    answer_options: list[dict[str, Any]] = []
    correct_count = 0
    for option in raw_options:
        if not isinstance(option, dict):
            continue
        is_correct = bool(option.get("assigned_right_answer", False))
        if is_correct:
            correct_count += 1
        answer_options.append({
            "text": str(option.get("text") or "").strip(),
            "is_correct": is_correct,
        })

    if not answer_options:
        return None

    if correct_count > 1:
        question_type = "MULTIPLE_CHOICE"
    else:
        question_type = "SINGLE_CHOICE"

    return {
        "question_text": question_text[:5000],
        "question_type": question_type,
        "points": 1,
        "explanation": None,
        "order_index": order_index,
        "answer_options": answer_options,
    }


# ── Insert helpers ────────────────────────────────────────────────────────────


def _create_exam_activity(
    conn,
    *,
    chapter_id: int,
    course_id: int,
    creator_id: int | None,
    name: str,
    published: bool,
) -> int:
    now = datetime.now(UTC)
    activity_uuid = f"activity_{ULID()}"

    insert_stmt = sa.text(
        """
        INSERT INTO activity (
            name,
            activity_type,
            activity_sub_type,
            content,
            details,
            published,
            chapter_id,
            course_id,
            "order",
            creator_id,
            activity_uuid,
            creation_date,
            update_date
        )
        VALUES (
            :name,
            'TYPE_EXAM',
            'SUBTYPE_EXAM_STANDARD',
            :content,
            :details,
            :published,
            :chapter_id,
            :course_id,
            :activity_order,
            :creator_id,
            :activity_uuid,
            :creation_date,
            :update_date
        )
        RETURNING id
        """
    ).bindparams(
        sa.bindparam("content", type_=sa.JSON),
        sa.bindparam("details", type_=sa.JSON),
    )
    row = (
        conn.execute(
            insert_stmt,
            {
                "name": (name or "Конвертированный тест")[:500],
                "content": {},
                "details": {},
                "published": published,
                "chapter_id": chapter_id,
                "course_id": course_id,
                "activity_order": _next_activity_order(conn, chapter_id),
                "creator_id": creator_id,
                "activity_uuid": activity_uuid,
                "creation_date": now,
                "update_date": now,
            },
        )
        .mappings()
        .first()
    )
    return int(row["id"])


def _create_exam(
    conn,
    *,
    title: str,
    description: str,
    published: bool,
    course_id: int,
    chapter_id: int,
    activity_id: int,
    settings: dict[str, Any],
) -> int:
    now_iso = _utc_now_iso()
    exam_uuid = f"exam_{ULID()}"

    insert_stmt = sa.text(
        """
        INSERT INTO exam (
            exam_uuid,
            title,
            description,
            published,
            course_id,
            chapter_id,
            activity_id,
            settings,
            creation_date,
            update_date
        )
        VALUES (
            :exam_uuid,
            :title,
            :description,
            :published,
            :course_id,
            :chapter_id,
            :activity_id,
            :settings,
            :creation_date,
            :update_date
        )
        RETURNING id
        """
    ).bindparams(sa.bindparam("settings", type_=sa.JSON))
    row = (
        conn.execute(
            insert_stmt,
            {
                "exam_uuid": exam_uuid,
                "title": title or "Конвертированный тест",
                "description": description or "",
                "published": published,
                "course_id": course_id,
                "chapter_id": chapter_id,
                "activity_id": activity_id,
                "settings": settings,
                "creation_date": now_iso,
                "update_date": now_iso,
            },
        )
        .mappings()
        .first()
    )
    return int(row["id"])


def _create_question(conn, *, exam_id: int, payload: dict[str, Any]) -> None:
    now_iso = _utc_now_iso()
    question_uuid = f"question_{ULID()}"

    insert_stmt = sa.text(
        """
        INSERT INTO question (
            question_uuid,
            question_text,
            question_type,
            points,
            explanation,
            order_index,
            answer_options,
            exam_id,
            creation_date,
            update_date
        )
        VALUES (
            :question_uuid,
            :question_text,
            :question_type,
            :points,
            :explanation,
            :order_index,
            :answer_options,
            :exam_id,
            :creation_date,
            :update_date
        )
        """
    ).bindparams(sa.bindparam("answer_options", type_=sa.JSON))
    conn.execute(
        insert_stmt,
        {
            "question_uuid": question_uuid,
            "question_text": payload["question_text"],
            "question_type": payload["question_type"],
            "points": payload["points"],
            "explanation": payload.get("explanation"),
            "order_index": payload["order_index"],
            "answer_options": payload["answer_options"],
            "exam_id": exam_id,
            "creation_date": now_iso,
            "update_date": now_iso,
        },
    )


# ── Conversion ────────────────────────────────────────────────────────────────


def _convert_quiz_task_to_exam(
    conn,
    *,
    assignment: dict[str, Any],
    task: dict[str, Any],
) -> None:
    """Materialise a QUIZ AssignmentTask as a TYPE_EXAM activity + Exam + Questions."""
    contents = _json_value(task.get("contents"), {})
    if not isinstance(contents, dict):
        contents = {}

    quiz_questions = contents.get("questions") or []
    quiz_settings = contents.get("settings") or {}

    course_row = _fetch_one(
        conn,
        "SELECT creator_id FROM course WHERE id = :course_id",
        course_id=assignment["course_id"],
    )
    creator_id = (course_row or {}).get("creator_id")

    base_title = (
        task.get("title") or assignment.get("title") or "Конвертированный тест"
    )
    base_description = task.get("description") or assignment.get("description") or ""
    published = bool(assignment.get("published"))

    new_activity_id = _create_exam_activity(
        conn,
        chapter_id=assignment["chapter_id"],
        course_id=assignment["course_id"],
        creator_id=creator_id,
        name=base_title,
        published=published,
    )

    settings_payload = _map_quiz_settings(quiz_settings)
    settings_payload["legacy_migration"] = {
        "source": "assignmenttask",
        "source_assignment_id": assignment["id"],
        "source_assignment_uuid": assignment.get("assignment_uuid"),
        "source_assignment_task_id": task["id"],
        "source_assignment_task_uuid": task.get("assignment_task_uuid"),
    }

    exam_id = _create_exam(
        conn,
        title=base_title,
        description=base_description,
        published=published,
        course_id=assignment["course_id"],
        chapter_id=assignment["chapter_id"],
        activity_id=new_activity_id,
        settings=settings_payload,
    )

    if isinstance(quiz_questions, list):
        order_cursor = 0
        for question_config in quiz_questions:
            if not isinstance(question_config, dict):
                continue
            payload = _map_quiz_question(question_config, order_index=order_cursor)
            if payload is None:
                continue
            _create_question(conn, exam_id=exam_id, payload=payload)
            order_cursor += 1


def _delete_empty_assignment(conn, assignment: dict[str, Any]) -> None:
    """Drop an Assignment with no remaining tasks plus its source activity.

    Cascade chain (per existing FK constraints):
        activity → assignment (CASCADE) → assignmenttask (CASCADE)
        activity → submission   (CASCADE)
        activity → activity_progress / block / etc. (CASCADE)
    """
    activity_id = assignment.get("activity_id")
    if activity_id is not None:
        conn.execute(
            sa.text("DELETE FROM activity WHERE id = :activity_id"),
            {"activity_id": activity_id},
        )
        return

    # Fallback: assignment is somehow not bound to an activity, drop it directly.
    conn.execute(
        sa.text("DELETE FROM assignment WHERE id = :id"),
        {"id": assignment["id"]},
    )


# ── Migration entry points ────────────────────────────────────────────────────


def upgrade() -> None:
    conn = op.get_bind()

    quiz_assignments = _fetch_all(
        conn,
        """
        SELECT DISTINCT a.*
        FROM assignment a
        JOIN assignmenttask t ON t.assignment_id = a.id
        WHERE t.assignment_type = 'QUIZ'
        ORDER BY a.id
        """,
    )

    for assignment in quiz_assignments:
        quiz_tasks = _fetch_all(
            conn,
            """
            SELECT *
            FROM assignmenttask
            WHERE assignment_id = :assignment_id
              AND assignment_type = 'QUIZ'
            ORDER BY "order", id
            """,
            assignment_id=assignment["id"],
        )

        for task in quiz_tasks:
            _convert_quiz_task_to_exam(conn, assignment=assignment, task=task)

        # Drop the legacy QUIZ tasks now that their data lives in the new Exam.
        conn.execute(
            sa.text(
                "DELETE FROM assignmenttask "
                "WHERE assignment_id = :assignment_id "
                "  AND assignment_type = 'QUIZ'"
            ),
            {"assignment_id": assignment["id"]},
        )

        # Pure-quiz assignment → no tasks remain → drop the assignment shell
        # together with its (now-redundant) source activity.
        remaining = _fetch_one(
            conn,
            "SELECT COUNT(*) AS count FROM assignmenttask "
            "WHERE assignment_id = :assignment_id",
            assignment_id=assignment["id"],
        )
        if int((remaining or {}).get("count", 0)) == 0:
            _delete_empty_assignment(conn, assignment)


def downgrade() -> None:
    """Best-effort downgrade — removes exams created by ``upgrade``.

    The legacy QUIZ ``assignmenttask`` rows (and pure-quiz assignment shells)
    were destroyed on upgrade and cannot be reconstructed losslessly. The
    downgrade only tears down the migrated exam activities so the schema is
    consistent with the previous head; the original quiz-task data is **not**
    restored.
    """
    conn = op.get_bind()

    migrated = _fetch_all(
        conn,
        """
        SELECT id, activity_id
        FROM exam
        WHERE settings::text LIKE '%"source": "assignmenttask"%'
        """,
    )
    for exam in migrated:
        activity_id = exam.get("activity_id")
        if activity_id is not None:
            # CASCADE drops exam → question → exam_attempt with the activity.
            conn.execute(
                sa.text("DELETE FROM activity WHERE id = :activity_id"),
                {"activity_id": activity_id},
            )
        else:
            conn.execute(
                sa.text("DELETE FROM exam WHERE id = :id"),
                {"id": exam["id"]},
            )
