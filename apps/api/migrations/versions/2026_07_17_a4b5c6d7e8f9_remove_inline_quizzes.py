"""Remove inline quizzes and their compatibility columns.

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-07-17
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "a4b5c6d7e8f9"
down_revision: str | None = "f3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REMOVED_NODE_TYPES = frozenset({"blockQuiz", "inlineQuiz"})

activity_table = sa.table(
    "activity",
    sa.column("id", sa.Integer),
    sa.column("content", sa.JSON),
)

assessment_table = sa.table(
    "assessment",
    sa.column("activity_id", sa.Integer),
    sa.column("inline_parent_activity_id", sa.Integer),
    sa.column("is_inline", sa.Boolean),
)


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())

    if "activity" in tables:
        _purge_inline_quiz_nodes(conn)

    assessment_columns = (
        {column["name"] for column in inspector.get_columns("assessment")} if "assessment" in tables else set()
    )
    inline_columns = {"inline_parent_activity_id", "is_inline"}

    if "activity" in tables and inline_columns.issubset(assessment_columns):
        _delete_inline_quiz_activities(conn)

    if "assessment" not in tables:
        return

    with op.batch_alter_table("assessment") as batch_op:
        if "inline_parent_activity_id" in assessment_columns:
            batch_op.drop_column("inline_parent_activity_id")
        if "is_inline" in assessment_columns:
            batch_op.drop_column("is_inline")


def downgrade() -> None:
    conn = op.get_bind()
    if "assessment" not in set(sa.inspect(conn).get_table_names()):
        return

    existing_columns = {column["name"] for column in sa.inspect(conn).get_columns("assessment")}
    with op.batch_alter_table("assessment") as batch_op:
        if "inline_parent_activity_id" not in existing_columns:
            batch_op.add_column(sa.Column("inline_parent_activity_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                "fk_assessment_inline_parent_activity_id_activity",
                "activity",
                ["inline_parent_activity_id"],
                ["id"],
                ondelete="SET NULL",
            )
        if "is_inline" not in existing_columns:
            batch_op.add_column(
                sa.Column("is_inline", sa.Boolean(), server_default=sa.false(), nullable=False)
            )


def _purge_inline_quiz_nodes(conn: sa.Connection) -> None:
    rows = conn.execute(
        sa.select(activity_table.c.id, activity_table.c.content).where(activity_table.c.content.is_not(None))
    ).fetchall()

    for row in rows:
        content = _decode_content(row.content)
        if content is None:
            continue
        next_content, changed = _remove_inline_quiz_nodes(content)
        if changed:
            conn.execute(
                activity_table.update().where(activity_table.c.id == row.id).values(content=next_content)
            )


def _delete_inline_quiz_activities(conn: sa.Connection) -> None:
    activity_ids = conn.execute(
        sa.select(assessment_table.c.activity_id).where(
            sa.or_(
                assessment_table.c.is_inline.is_(True),
                assessment_table.c.inline_parent_activity_id.is_not(None),
            )
        )
    ).scalars()
    unique_activity_ids = set(activity_ids)
    if unique_activity_ids:
        conn.execute(activity_table.delete().where(activity_table.c.id.in_(unique_activity_ids)))


def _decode_content(value: Any) -> dict[str, Any] | list[Any] | None:
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str):
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, (dict, list)) else None


def _remove_inline_quiz_nodes(value: Any) -> tuple[Any, bool]:
    if isinstance(value, list):
        changed = False
        next_items: list[Any] = []
        for item in value:
            if isinstance(item, dict) and item.get("type") in _REMOVED_NODE_TYPES:
                changed = True
                continue
            next_item, item_changed = _remove_inline_quiz_nodes(item)
            next_items.append(next_item)
            changed = changed or item_changed
        return next_items, changed

    if not isinstance(value, dict):
        return value, False

    content = value.get("content")
    if not isinstance(content, list):
        return value, False

    next_content, changed = _remove_inline_quiz_nodes(content)
    if not changed:
        return value, False

    next_value = dict(value)
    next_value["content"] = next_content
    return next_value, True
