"""Remove legacy blockQuiz nodes from activity content.

Revision ID: 6f7a8b9c0d1e
Revises: 1a2b3c4d5e6f
Create Date: 2026-05-18
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from alembic import op
from ulid import ULID

revision: str = "6f7a8b9c0d1e"
down_revision: str | None = "1a2b3c4d5e6f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


activity_table = sa.table(
    "activity",
    sa.column("id", sa.Integer),
    sa.column("name", sa.String),
    sa.column("activity_type", sa.Enum(name="activitytypeenum")),
    sa.column("activity_sub_type", sa.Enum(name="activitysubtypeenum")),
    sa.column("content", sa.JSON),
    sa.column("details", sa.JSON),
    sa.column("settings", sa.JSON),
    sa.column("published", sa.Boolean),
    sa.column("chapter_id", sa.Integer),
    sa.column("course_id", sa.Integer),
    sa.column("order", sa.Integer),
    sa.column("creator_id", sa.Integer),
    sa.column("activity_uuid", sa.String),
    sa.column("creation_date", sa.DateTime(timezone=True)),
    sa.column("update_date", sa.DateTime(timezone=True)),
)

assessment_policy_table = sa.table(
    "assessment_policy",
    sa.column("id", sa.Integer),
    sa.column("policy_uuid", sa.String),
    sa.column("activity_id", sa.Integer),
    sa.column("assessment_type", sa.String),
    sa.column("grading_mode", sa.String),
    sa.column("grade_release_mode", sa.String),
    sa.column("completion_rule", sa.String),
    sa.column("passing_score", sa.Float),
    sa.column("allow_late", sa.Boolean),
    sa.column("late_policy_json", sa.JSON),
    sa.column("anti_cheat_json", sa.JSON),
    sa.column("settings_json", sa.JSON),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)

assessment_table = sa.table(
    "assessment",
    sa.column("id", sa.Integer),
    sa.column("assessment_uuid", sa.String),
    sa.column("activity_id", sa.Integer),
    sa.column("kind", sa.String),
    sa.column("title", sa.String),
    sa.column("description", sa.String),
    sa.column("lifecycle", sa.String),
    sa.column("weight", sa.Float),
    sa.column("grading_type", sa.String),
    sa.column("policy_id", sa.Integer),
    sa.column("inline_parent_activity_id", sa.Integer),
    sa.column("is_inline", sa.Boolean),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)

assessment_item_table = sa.table(
    "assessment_item",
    sa.column("id", sa.Integer),
    sa.column("item_uuid", sa.String),
    sa.column("assessment_id", sa.Integer),
    sa.column("order", sa.Integer),
    sa.column("kind", sa.String),
    sa.column("title", sa.String),
    sa.column("body_json", sa.JSON),
    sa.column("max_score", sa.Float),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)


def upgrade() -> None:
    conn = op.get_bind()
    if not _required_tables_exist(conn):
        return

    rows = conn.execute(
        sa.select(
            activity_table.c.id,
            activity_table.c.name,
            activity_table.c.content,
            activity_table.c.chapter_id,
            activity_table.c.course_id,
            activity_table.c.creator_id,
        ).where(
            activity_table.c.content.is_not(None),
            sa.cast(activity_table.c.content, sa.String).like("%blockQuiz%"),
        )
    ).fetchall()

    for row in rows:
        content = _as_dict(row.content)
        if content is None:
            continue

        next_content, changed = _replace_legacy_block_quizzes(conn, row, content)
        if changed:
            conn.execute(activity_table.update().where(activity_table.c.id == row.id).values(content=next_content))


def downgrade() -> None:
    pass


def _required_tables_exist(conn: sa.Connection) -> bool:
    existing_tables = set(sa.inspect(conn).get_table_names())
    return {"activity", "assessment_policy", "assessment", "assessment_item"}.issubset(existing_tables)


def _as_dict(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def _replace_legacy_block_quizzes(
    conn: sa.Connection,
    activity: Any,
    value: Any,
) -> tuple[Any, bool]:
    if isinstance(value, list):
        changed = False
        next_items: list[Any] = []
        for item in value:
            next_item, item_changed = _replace_legacy_block_quizzes(conn, activity, item)
            next_items.append(next_item)
            changed = changed or item_changed
        return next_items, changed

    if not isinstance(value, dict):
        return value, False

    if value.get("type") == "blockQuiz":
        return _legacy_block_quiz_to_inline_quiz(conn, activity, value), True

    content = value.get("content")
    if not isinstance(content, list):
        return value, False

    next_content, changed = _replace_legacy_block_quizzes(conn, activity, content)
    if not changed:
        return value, False

    next_value = dict(value)
    next_value["content"] = next_content
    return next_value, True


def _legacy_block_quiz_to_inline_quiz(
    conn: sa.Connection,
    activity: Any,
    node: dict[str, Any],
) -> dict[str, Any]:
    attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
    assessment_uuid = _read_assessment_uuid(attrs)
    if assessment_uuid is None:
        assessment_uuid = _create_inline_assessment(conn, activity, attrs)

    return {
        "type": "inlineQuiz",
        "attrs": {
            "assessmentUuid": assessment_uuid,
        },
    }


def _read_assessment_uuid(attrs: dict[str, Any]) -> str | None:
    for key in ("assessmentUuid", "assessment_uuid", "assessmentId", "assessment_id"):
        value = attrs.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return None


def _create_inline_assessment(
    conn: sa.Connection,
    parent_activity: Any,
    attrs: dict[str, Any],
) -> str:
    now = datetime.now(UTC)
    title = _legacy_quiz_title(parent_activity)

    quiz_activity_id = conn.execute(
        activity_table
        .insert()
        .values(
            name=title,
            activity_type="TYPE_CUSTOM",
            activity_sub_type="SUBTYPE_CUSTOM",
            content={},
            details={
                "lifecycle_status": "DRAFT",
                "legacy_block_quiz": {
                    "quizId": attrs.get("quizId"),
                },
            },
            settings={"kind": "INLINE_QUIZ"},
            published=False,
            chapter_id=parent_activity.chapter_id,
            course_id=parent_activity.course_id,
            order=0,
            creator_id=parent_activity.creator_id,
            activity_uuid=f"activity_{ULID()}",
            creation_date=now,
            update_date=now,
        )
        .returning(activity_table.c.id)
    ).scalar_one()

    policy_id = conn.execute(
        assessment_policy_table
        .insert()
        .values(
            policy_uuid=f"policy_{ULID()}",
            activity_id=quiz_activity_id,
            assessment_type="QUIZ",
            grading_mode="AUTO",
            grade_release_mode="IMMEDIATE",
            completion_rule="GRADED",
            passing_score=60.0,
            allow_late=True,
            late_policy_json={"kind": "NONE"},
            anti_cheat_json={},
            settings_json={"kind": "INLINE_QUIZ", "source": "legacy_blockQuiz"},
            created_at=now,
            updated_at=now,
        )
        .returning(assessment_policy_table.c.id)
    ).scalar_one()

    assessment_uuid = f"assessment_{ULID()}"
    assessment_id = conn.execute(
        assessment_table
        .insert()
        .values(
            assessment_uuid=assessment_uuid,
            activity_id=quiz_activity_id,
            kind="QUIZ",
            title=title,
            description="",
            lifecycle="DRAFT",
            weight=0.0,
            grading_type="PERCENTAGE",
            policy_id=policy_id,
            inline_parent_activity_id=parent_activity.id,
            is_inline=True,
            created_at=now,
            updated_at=now,
        )
        .returning(assessment_table.c.id)
    ).scalar_one()

    _create_assessment_items(conn, assessment_id, attrs, now)
    return assessment_uuid


def _legacy_quiz_title(parent_activity: Any) -> str:
    name = parent_activity.name if isinstance(parent_activity.name, str) else ""
    return (f"{name} Inline Quiz".strip() or "Inline Quiz")[:500]


def _create_assessment_items(
    conn: sa.Connection,
    assessment_id: int,
    attrs: dict[str, Any],
    now: datetime,
) -> None:
    questions = attrs.get("questions")
    if not isinstance(questions, list):
        return

    rows: list[dict[str, Any]] = []
    for index, question in enumerate(questions):
        if not isinstance(question, dict):
            continue
        item = _legacy_question_to_item(assessment_id, question, index, now)
        if item is not None:
            rows.append(item)

    if rows:
        conn.execute(assessment_item_table.insert(), rows)


def _legacy_question_to_item(
    assessment_id: int,
    question: dict[str, Any],
    index: int,
    now: datetime,
) -> dict[str, Any] | None:
    prompt = question.get("question")
    if not isinstance(prompt, str):
        prompt = ""

    question_type = question.get("type")
    if question_type == "custom_answer":
        kind = "OPEN_TEXT"
        body = {"kind": "OPEN_TEXT", "prompt": prompt}
    else:
        kind = "CHOICE"
        options = _legacy_answers_to_options(question.get("answers"))
        correct_count = sum(1 for option in options if option.get("is_correct") is True)
        body = {
            "kind": "CHOICE",
            "prompt": prompt,
            "options": options,
            "multiple": correct_count > 1,
            "variant": "MULTIPLE_CHOICE" if correct_count > 1 else "SINGLE_CHOICE",
        }

    return {
        "item_uuid": _legacy_item_uuid(),
        "assessment_id": assessment_id,
        "order": index,
        "kind": kind,
        "title": prompt[:120],
        "body_json": body,
        "max_score": 1.0,
        "created_at": now,
        "updated_at": now,
    }


def _legacy_answers_to_options(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    options: list[dict[str, Any]] = []
    for answer in value:
        if not isinstance(answer, dict):
            continue
        answer_id = answer.get("answer_id")
        answer_text = answer.get("answer")
        options.append({
            "id": answer_id if isinstance(answer_id, str) and answer_id else str(ULID()),
            "text": answer_text if isinstance(answer_text, str) else "",
            "is_correct": answer.get("correct") is True,
        })
    return options


def _legacy_item_uuid() -> str:
    return f"item_{ULID()}"
