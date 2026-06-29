"""Delete legacy code test fields from assessment item JSON.

Revision ID: 7b6a5c4d3e2f
Revises: 3f7c1d8a9b2e
Create Date: 2026-05-14
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "7b6a5c4d3e2f"
down_revision: str | None = "3f7c1d8a9b2e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LEGACY_TEST_KEYS: tuple[str, ...] = (
    "group",
    "time_limit_override",
    "time_limit_override_seconds",
)


def upgrade() -> None:
    conn = op.get_bind()
    table = sa.table(
        "assessment_item",
        sa.column("id", sa.Integer),
        sa.column("kind", sa.String),
        sa.column("body_json", sa.JSON),
    )

    rows = conn.execute(sa.select(table.c.id, table.c.body_json).where(table.c.kind == "CODE")).fetchall()
    for row in rows:
        body = _as_dict(row.body_json)
        if body is None:
            continue

        cleaned = _clean_code_item_body(body)
        if cleaned == body:
            continue

        conn.execute(table.update().where(table.c.id == row.id).values(body_json=cleaned))


def downgrade() -> None:
    # Destructive cleanup: legacy fields cannot be reconstructed.
    pass


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


def _clean_code_item_body(body: dict[str, Any]) -> dict[str, Any]:
    tests = body.get("tests")
    if not isinstance(tests, list):
        return body

    changed = False
    cleaned_tests: list[Any] = []
    for test in tests:
        if not isinstance(test, dict):
            cleaned_tests.append(test)
            continue

        cleaned_test = dict(test)
        for key in _LEGACY_TEST_KEYS:
            if key in cleaned_test:
                cleaned_test.pop(key)
                changed = True
        cleaned_tests.append(cleaned_test)

    if not changed:
        return body

    cleaned_body = dict(body)
    cleaned_body["tests"] = cleaned_tests
    return cleaned_body
