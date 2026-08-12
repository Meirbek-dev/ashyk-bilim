from __future__ import annotations

import importlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

migration = importlib.import_module("migrations.versions.2026_07_17_a4b5c6d7e8f9_remove_inline_quizzes")


def test_upgrade_removes_inline_quiz_data_and_columns(monkeypatch: pytest.MonkeyPatch) -> None:
    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    activity = sa.Table(
        "activity",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("content", sa.JSON, nullable=True),
    )
    assessment = sa.Table(
        "assessment",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("activity_id", sa.ForeignKey("activity.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "inline_parent_activity_id",
            sa.ForeignKey("activity.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_inline", sa.Boolean, nullable=False, server_default=sa.false()),
    )

    with engine.begin() as conn:
        conn.execute(sa.text("PRAGMA foreign_keys=ON"))
        metadata.create_all(conn)
        conn.execute(
            activity.insert(),
            [
                {
                    "id": 1,
                    "content": {
                        "type": "doc",
                        "content": [
                            {"type": "paragraph", "content": [{"type": "text", "text": "Keep"}]},
                            {"type": "inlineQuiz", "attrs": {"assessmentUuid": "assessment_inline"}},
                            {
                                "type": "blockquote",
                                "content": [
                                    {"type": "blockQuiz", "attrs": {"quizId": "legacy"}},
                                    {"type": "paragraph"},
                                ],
                            },
                        ],
                    },
                },
                {"id": 2, "content": {"type": "doc", "content": []}},
                {"id": 3, "content": {"type": "doc", "content": [{"type": "paragraph"}]}},
            ],
        )
        conn.execute(
            assessment.insert(),
            [
                {"id": 1, "activity_id": 2, "inline_parent_activity_id": 1, "is_inline": True},
                {"id": 2, "activity_id": 3, "inline_parent_activity_id": None, "is_inline": False},
            ],
        )

        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(conn)))
        migration.upgrade()

        assert conn.execute(sa.select(activity.c.id).order_by(activity.c.id)).scalars().all() == [1, 3]
        assert conn.execute(sa.text("SELECT id FROM assessment ORDER BY id")).scalars().all() == [2]
        assert {column["name"] for column in sa.inspect(conn).get_columns("assessment")} == {
            "id",
            "activity_id",
        }

        migrated_content = conn.execute(sa.select(activity.c.content).where(activity.c.id == 1)).scalar_one()
        assert migrated_content == {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Keep"}]},
                {"type": "blockquote", "content": [{"type": "paragraph"}]},
            ],
        }

        migration.downgrade()
        downgraded_columns = {column["name"] for column in sa.inspect(conn).get_columns("assessment")}
        assert {"inline_parent_activity_id", "is_inline"}.issubset(downgraded_columns)
