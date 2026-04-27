"""Backfill assignment contracts into unified submissions

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
Create Date: 2026-04-27 00:00:00.000000
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, date, datetime, time
from typing import Any

import sqlalchemy as sa
from alembic import op
from ulid import ULID

revision: str = "x4y5z6a7b8c9"
down_revision: str | None = "w3x4y5z6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _coerce_datetime(value: Any, *, end_of_day: bool = False) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, time.max if end_of_day else time.min)
    elif isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        if normalized.endswith("Z"):
            normalized = f"{normalized[:-1]}+00:00"
        try:
            if "T" in normalized or " " in normalized:
                parsed = datetime.fromisoformat(normalized)
            else:
                parsed = datetime.combine(
                    date.fromisoformat(normalized),
                    time.max if end_of_day else time.min,
                )
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _json_value(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, str):
        if not value.strip():
            return default
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return default
    return value


def _has_submitted_work(value: Any) -> bool:
    payload = _json_value(value, {})
    if not isinstance(payload, dict) or not payload:
        return False
    if set(payload.keys()) == {"fileUUID"} and not payload.get("fileUUID"):
        return False
    if set(payload.keys()) == {"file_uuid"} and not payload.get("file_uuid"):
        return False
    if "answers" in payload and payload.get("answers") in ({}, [], None, ""):
        return False
    return True


def _content_type_for_assignment_type(assignment_type: str | None) -> str:
    if assignment_type == "FILE_SUBMISSION":
        return "file"
    if assignment_type == "FORM":
        return "form"
    if assignment_type == "QUIZ":
        return "quiz"
    return "other"


def _answer_from_task_submission(
    task: dict[str, Any],
    task_submission: dict[str, Any] | None,
) -> dict[str, Any]:
    raw_submission = _json_value(
        task_submission["task_submission"] if task_submission else None,
        {},
    )
    if not isinstance(raw_submission, dict):
        raw_submission = {"value": raw_submission}

    content_type = _content_type_for_assignment_type(task.get("assignment_type"))
    answer: dict[str, Any] = {
        "task_uuid": task["assignment_task_uuid"],
        "content_type": content_type,
        "answer_metadata": {
            "legacy_assignment_type": task.get("assignment_type"),
            "legacy_task_submission_uuid": task_submission.get(
                "assignment_task_submission_uuid"
            )
            if task_submission
            else None,
        },
    }

    if content_type == "file":
        file_key = (
            raw_submission.get("file_key")
            or raw_submission.get("fileUUID")
            or raw_submission.get("file_uuid")
        )
        if file_key:
            answer["file_key"] = file_key
    elif content_type == "form":
        form_data = raw_submission.get("form_data")
        answer["form_data"] = (
            form_data if isinstance(form_data, dict) else raw_submission
        )
    elif content_type == "quiz":
        quiz_answers = raw_submission.get("quiz_answers")
        if not isinstance(quiz_answers, dict):
            quiz_answers = raw_submission.get("answers")
        answer["quiz_answers"] = (
            quiz_answers if isinstance(quiz_answers, dict) else raw_submission
        )
    else:
        text_content = raw_submission.get("text_content")
        if isinstance(text_content, str):
            answer["text_content"] = text_content
        answer["answer_metadata"]["legacy_payload"] = raw_submission

    return answer


def _build_grading_json(
    tasks: list[dict[str, Any]],
    submissions_by_task_id: dict[int, dict[str, Any]],
    *,
    assignment_is_graded: bool,
) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    for task in tasks:
        task_submission = submissions_by_task_id.get(task["id"])
        task_feedback = ""
        task_score = 0.0
        task_submission_uuid = None
        if task_submission:
            task_feedback = task_submission.get("task_submission_grade_feedback") or ""
            task_score = float(task_submission.get("grade") or 0)
            task_submission_uuid = task_submission.get(
                "assignment_task_submission_uuid"
            )

        legacy_item_graded = assignment_is_graded or bool(task_feedback)
        user_answer = (
            _answer_from_task_submission(task, task_submission)
            if task_submission
            and _has_submitted_work(task_submission.get("task_submission"))
            else None
        )
        items.append({
            "item_id": task["assignment_task_uuid"],
            "item_text": task.get("title") or "",
            "score": task_score,
            "max_score": float(task.get("max_grade_value") or 0),
            "correct": None,
            "feedback": task_feedback,
            "needs_manual_review": not legacy_item_graded,
            "user_answer": user_answer,
            "correct_answer": None,
            "legacy_graded": legacy_item_graded,
            "legacy_task_submission_uuid": task_submission_uuid,
        })

    return {
        "items": items,
        "needs_manual_review": any(item["needs_manual_review"] for item in items),
        "auto_graded": False,
        "feedback": "",
        "legacy_migration": {
            "source": "assignmenttasksubmission",
            "graded_marker": "legacy_graded",
        },
    }


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


def _create_assignment_activity(
    conn,
    assignment: dict[str, Any],
    source_activity: dict[str, Any] | None,
) -> int:
    course = _fetch_one(
        conn,
        "SELECT creator_id FROM course WHERE id = :course_id",
        course_id=assignment["course_id"],
    )
    now = datetime.now(UTC)
    activity_uuid = f"activity_{ULID()}"
    activity_name = assignment.get("title") or "Assignment"
    details = source_activity.get("details") if source_activity else {}
    content = source_activity.get("content") if source_activity else {}

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
            'TYPE_ASSIGNMENT',
            'SUBTYPE_ASSIGNMENT_ANY',
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
        conn
        .execute(
            insert_stmt,
            {
                "name": activity_name,
                "content": _json_value(content, {}),
                "details": _json_value(details, {}),
                "published": bool(assignment.get("published")),
                "chapter_id": assignment["chapter_id"],
                "course_id": assignment["course_id"],
                "activity_order": _next_activity_order(conn, assignment["chapter_id"]),
                "creator_id": (course or {}).get("creator_id"),
                "activity_uuid": activity_uuid,
                "creation_date": _coerce_datetime(assignment.get("creation_date"))
                or now,
                "update_date": _coerce_datetime(assignment.get("update_date")) or now,
            },
        )
        .mappings()
        .first()
    )
    return int(row["id"])


def _ensure_assignment_activities(conn) -> None:
    assignments = _fetch_all(conn, "SELECT * FROM assignment ORDER BY id")
    seen_activity_ids: set[int] = set()

    for assignment in assignments:
        activity_id = assignment.get("activity_id")
        source_activity = (
            _fetch_one(conn, "SELECT * FROM activity WHERE id = :id", id=activity_id)
            if activity_id is not None
            else None
        )
        needs_new_activity = source_activity is None or activity_id in seen_activity_ids

        if needs_new_activity:
            new_activity_id = _create_assignment_activity(
                conn,
                assignment,
                source_activity,
            )
            conn.execute(
                sa.text(
                    "UPDATE assignment SET activity_id = :activity_id WHERE id = :id"
                ),
                {"activity_id": new_activity_id, "id": assignment["id"]},
            )
            conn.execute(
                sa.text(
                    "UPDATE assignmenttask SET activity_id = :activity_id "
                    "WHERE assignment_id = :assignment_id"
                ),
                {
                    "activity_id": new_activity_id,
                    "assignment_id": assignment["id"],
                },
            )
            conn.execute(
                sa.text(
                    "UPDATE assignmenttasksubmission SET activity_id = :activity_id "
                    "WHERE assignment_task_id IN ("
                    "  SELECT id FROM assignmenttask WHERE assignment_id = :assignment_id"
                    ")"
                ),
                {
                    "activity_id": new_activity_id,
                    "assignment_id": assignment["id"],
                },
            )
            seen_activity_ids.add(new_activity_id)
            continue

        conn.execute(
            sa.text(
                """
                UPDATE activity
                SET activity_type = 'TYPE_ASSIGNMENT',
                    activity_sub_type = 'SUBTYPE_ASSIGNMENT_ANY',
                    chapter_id = :chapter_id,
                    course_id = :course_id
                WHERE id = :activity_id
                """
            ),
            {
                "activity_id": activity_id,
                "chapter_id": assignment["chapter_id"],
                "course_id": assignment["course_id"],
            },
        )
        seen_activity_ids.add(activity_id)


def _backfill_due_at(conn) -> None:
    assignments = _fetch_all(
        conn,
        "SELECT id, due_date, due_at FROM assignment WHERE due_at IS NULL",
    )
    for assignment in assignments:
        due_at = _coerce_datetime(assignment.get("due_date"), end_of_day=True)
        if due_at is None:
            continue
        conn.execute(
            sa.text("UPDATE assignment SET due_at = :due_at WHERE id = :id"),
            {"due_at": due_at, "id": assignment["id"]},
        )


def _backfill_task_order(conn) -> None:
    rows = _fetch_all(
        conn,
        "SELECT id, assignment_id FROM assignmenttask ORDER BY assignment_id, id",
    )
    counters: dict[int, int] = {}
    for row in rows:
        assignment_id = row["assignment_id"]
        order = counters.get(assignment_id, 0)
        conn.execute(
            sa.text('UPDATE assignmenttask SET "order" = :task_order WHERE id = :id'),
            {"task_order": order, "id": row["id"]},
        )
        counters[assignment_id] = order + 1


def _best_submitted_at(
    task_submissions: list[dict[str, Any]],
    assignment_submission: dict[str, Any] | None,
) -> datetime | None:
    task_times = [
        candidate
        for candidate in (
            _coerce_datetime(row.get("creation_date"))
            for row in task_submissions
            if _has_submitted_work(row.get("task_submission"))
        )
        if candidate is not None
    ]
    if task_times:
        return min(task_times)
    if assignment_submission:
        return _coerce_datetime(
            assignment_submission.get("submitted_at")
            or assignment_submission.get("creation_date")
        )
    return None


def _best_graded_at(
    task_submissions: list[dict[str, Any]],
    assignment_submission: dict[str, Any] | None,
) -> datetime | None:
    if assignment_submission:
        explicit = _coerce_datetime(assignment_submission.get("graded_at"))
        if explicit is not None:
            return explicit
    task_times = [
        candidate
        for candidate in (
            _coerce_datetime(row.get("update_date")) for row in task_submissions
        )
        if candidate is not None
    ]
    return max(task_times) if task_times else None


def _legacy_status_to_submission_status(
    legacy_status: str | None,
    *,
    has_work: bool,
) -> str | None:
    if legacy_status == "GRADED":
        return "GRADED"
    if legacy_status in {"SUBMITTED", "LATE"}:
        return "PENDING"
    if has_work:
        return "DRAFT"
    return None


def _upsert_assignment_submission(
    conn,
    *,
    assignment: dict[str, Any],
    tasks: list[dict[str, Any]],
    task_submissions: list[dict[str, Any]],
    assignment_submission: dict[str, Any] | None,
    user_id: int,
) -> None:
    task_submissions_by_task_id = {
        row["assignment_task_id"]: row for row in task_submissions
    }
    has_work = any(
        _has_submitted_work(row.get("task_submission")) for row in task_submissions
    )
    legacy_status = (
        assignment_submission.get("submission_status")
        if assignment_submission
        else None
    )
    status = _legacy_status_to_submission_status(legacy_status, has_work=has_work)
    existing = _fetch_one(
        conn,
        """
        SELECT *
        FROM submission
        WHERE activity_id = :activity_id
          AND user_id = :user_id
          AND assessment_type = 'ASSIGNMENT'
        ORDER BY id
        LIMIT 1
        """,
        activity_id=assignment["activity_id"],
        user_id=user_id,
    )

    if status is None and existing is None:
        return
    if status is None:
        status = "DRAFT"

    answers_json = {
        "tasks": [
            _answer_from_task_submission(
                task, task_submissions_by_task_id.get(task["id"])
            )
            for task in tasks
            if task["id"] in task_submissions_by_task_id
            and _has_submitted_work(
                task_submissions_by_task_id[task["id"]].get("task_submission")
            )
        ]
    }
    assignment_is_graded = status == "GRADED"
    grading_json = _build_grading_json(
        tasks,
        task_submissions_by_task_id,
        assignment_is_graded=assignment_is_graded,
    )

    submitted_at = (
        None
        if status == "DRAFT"
        else _best_submitted_at(
            task_submissions,
            assignment_submission,
        )
    )
    graded_at = (
        _best_graded_at(task_submissions, assignment_submission)
        if status == "GRADED"
        else None
    )
    due_at = _coerce_datetime(assignment.get("due_at"))
    is_late = bool(
        legacy_status == "LATE" or (submitted_at and due_at and submitted_at > due_at)
    )
    now = datetime.now(UTC)
    created_at = (
        _coerce_datetime((assignment_submission or {}).get("creation_date"))
        or submitted_at
        or now
    )
    updated_at = (
        _coerce_datetime((assignment_submission or {}).get("update_date"))
        or graded_at
        or submitted_at
        or now
    )
    final_score = (
        float(assignment_submission.get("grade") or 0)
        if assignment_is_graded and assignment_submission
        else None
    )

    bind_json = [
        sa.bindparam("answers_json", type_=sa.JSON),
        sa.bindparam("grading_json", type_=sa.JSON),
    ]
    if existing:
        conn.execute(
            sa.text(
                """
                UPDATE submission
                SET status = :status,
                    answers_json = :answers_json,
                    grading_json = :grading_json,
                    final_score = :final_score,
                    is_late = :is_late,
                    submitted_at = :submitted_at,
                    graded_at = :graded_at,
                    updated_at = :updated_at,
                    grading_version = 1
                WHERE id = :id
                """
            ).bindparams(*bind_json),
            {
                "id": existing["id"],
                "status": status,
                "answers_json": answers_json,
                "grading_json": grading_json,
                "final_score": final_score,
                "is_late": is_late,
                "submitted_at": submitted_at,
                "graded_at": graded_at,
                "updated_at": updated_at,
            },
        )
        return

    conn.execute(
        sa.text(
            """
            INSERT INTO submission (
                submission_uuid,
                assessment_type,
                activity_id,
                user_id,
                auto_score,
                final_score,
                status,
                attempt_number,
                is_late,
                answers_json,
                grading_json,
                started_at,
                submitted_at,
                graded_at,
                created_at,
                updated_at,
                grading_version
            )
            VALUES (
                :submission_uuid,
                'ASSIGNMENT',
                :activity_id,
                :user_id,
                NULL,
                :final_score,
                :status,
                1,
                :is_late,
                :answers_json,
                :grading_json,
                :started_at,
                :submitted_at,
                :graded_at,
                :created_at,
                :updated_at,
                1
            )
            """
        ).bindparams(*bind_json),
        {
            "submission_uuid": f"submission_{ULID()}",
            "activity_id": assignment["activity_id"],
            "user_id": user_id,
            "final_score": final_score,
            "status": status,
            "is_late": is_late,
            "answers_json": answers_json,
            "grading_json": grading_json,
            "started_at": created_at,
            "submitted_at": submitted_at,
            "graded_at": graded_at,
            "created_at": created_at,
            "updated_at": updated_at,
        },
    )


def _backfill_unified_assignment_submissions(conn) -> None:
    assignments = _fetch_all(conn, "SELECT * FROM assignment ORDER BY id")
    for assignment in assignments:
        tasks = _fetch_all(
            conn,
            """
            SELECT *
            FROM assignmenttask
            WHERE assignment_id = :assignment_id
            ORDER BY "order", id
            """,
            assignment_id=assignment["id"],
        )
        legacy_assignment_submissions = _fetch_all(
            conn,
            """
            SELECT *
            FROM assignmentusersubmission
            WHERE assignment_id = :assignment_id
            """,
            assignment_id=assignment["id"],
        )
        assignment_submission_by_user = {
            row["user_id"]: row for row in legacy_assignment_submissions
        }
        task_submissions = _fetch_all(
            conn,
            """
            SELECT ats.*
            FROM assignmenttasksubmission ats
            JOIN assignmenttask at ON at.id = ats.assignment_task_id
            WHERE at.assignment_id = :assignment_id
            ORDER BY ats.user_id, ats.assignment_task_id, ats.id
            """,
            assignment_id=assignment["id"],
        )
        task_submission_by_user: dict[int, list[dict[str, Any]]] = {}
        for row in task_submissions:
            task_submission_by_user.setdefault(row["user_id"], [])
            # Last row for a duplicated user/task pair wins, while preserving
            # all other task submissions for that user.
            existing_index = next(
                (
                    index
                    for index, existing in enumerate(
                        task_submission_by_user[row["user_id"]]
                    )
                    if existing["assignment_task_id"] == row["assignment_task_id"]
                ),
                None,
            )
            if existing_index is None:
                task_submission_by_user[row["user_id"]].append(row)
            else:
                task_submission_by_user[row["user_id"]][existing_index] = row

        user_ids = set(assignment_submission_by_user) | set(task_submission_by_user)
        for user_id in sorted(user_ids):
            _upsert_assignment_submission(
                conn,
                assignment=assignment,
                tasks=tasks,
                task_submissions=task_submission_by_user.get(user_id, []),
                assignment_submission=assignment_submission_by_user.get(user_id),
                user_id=user_id,
            )


def upgrade() -> None:
    conn = op.get_bind()
    _ensure_assignment_activities(conn)
    _backfill_due_at(conn)
    _backfill_task_order(conn)
    _backfill_unified_assignment_submissions(conn)

    op.create_unique_constraint(
        "uq_assignment_activity_id",
        "assignment",
        ["activity_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_assignment_activity_id", "assignment", type_="unique")
