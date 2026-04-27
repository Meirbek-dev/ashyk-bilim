from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool


def load_migration_module():
    migration_path = (
        Path(__file__).parents[3]
        / "migrations"
        / "versions"
        / "x4y5z6a7b8c9_backfill_assignment_submissions.py"
    )
    spec = importlib.util.spec_from_file_location("assignment_phase2", migration_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def create_schema(conn) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE course (
                id INTEGER PRIMARY KEY,
                creator_id INTEGER
            )
            """
        )
    )
    conn.execute(
        text(
            """
            CREATE TABLE activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                activity_type TEXT,
                activity_sub_type TEXT,
                content JSON,
                details JSON,
                published BOOLEAN,
                chapter_id INTEGER,
                course_id INTEGER,
                "order" INTEGER,
                creator_id INTEGER,
                activity_uuid TEXT,
                creation_date TIMESTAMP,
                update_date TIMESTAMP
            )
            """
        )
    )
    conn.execute(
        text(
            """
            CREATE TABLE assignment (
                id INTEGER PRIMARY KEY,
                assignment_uuid TEXT,
                title TEXT,
                description TEXT,
                due_date TEXT,
                due_at TIMESTAMP,
                published BOOLEAN,
                grading_type TEXT,
                course_id INTEGER,
                chapter_id INTEGER,
                activity_id INTEGER,
                creation_date TEXT,
                update_date TEXT
            )
            """
        )
    )
    conn.execute(
        text(
            """
            CREATE TABLE assignmenttask (
                id INTEGER PRIMARY KEY,
                assignment_task_uuid TEXT,
                title TEXT,
                description TEXT,
                hint TEXT,
                reference_file TEXT,
                assignment_type TEXT,
                contents JSON,
                max_grade_value INTEGER,
                "order" INTEGER,
                assignment_id INTEGER,
                course_id INTEGER,
                chapter_id INTEGER,
                activity_id INTEGER,
                creation_date TEXT,
                update_date TEXT
            )
            """
        )
    )
    conn.execute(
        text(
            """
            CREATE TABLE assignmentusersubmission (
                id INTEGER PRIMARY KEY,
                assignmentusersubmission_uuid TEXT,
                submission_status TEXT,
                grade INTEGER,
                user_id INTEGER,
                assignment_id INTEGER,
                submitted_at TIMESTAMP,
                graded_at TIMESTAMP,
                creation_date TEXT,
                update_date TEXT
            )
            """
        )
    )
    conn.execute(
        text(
            """
            CREATE TABLE assignmenttasksubmission (
                id INTEGER PRIMARY KEY,
                assignment_task_submission_uuid TEXT,
                task_submission JSON,
                grade INTEGER,
                task_submission_grade_feedback TEXT,
                assignment_type TEXT,
                user_id INTEGER,
                activity_id INTEGER,
                course_id INTEGER,
                chapter_id INTEGER,
                assignment_task_id INTEGER,
                creation_date TEXT,
                update_date TEXT
            )
            """
        )
    )
    conn.execute(
        text(
            """
            CREATE TABLE submission (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                submission_uuid TEXT,
                assessment_type TEXT,
                activity_id INTEGER,
                user_id INTEGER,
                auto_score FLOAT,
                final_score FLOAT,
                status TEXT,
                attempt_number INTEGER,
                is_late BOOLEAN,
                answers_json JSON,
                grading_json JSON,
                started_at TIMESTAMP,
                submitted_at TIMESTAMP,
                graded_at TIMESTAMP,
                created_at TIMESTAMP,
                updated_at TIMESTAMP,
                grading_version INTEGER
            )
            """
        )
    )


def test_phase2_backfill_repairs_duplicate_assignment_activities() -> None:
    migration = load_migration_module()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    with engine.begin() as conn:
        create_schema(conn)
        conn.execute(text("INSERT INTO course (id, creator_id) VALUES (1, 99)"))
        conn.execute(
            text(
                """
                INSERT INTO activity (
                    id, name, activity_type, activity_sub_type, content, details,
                    published, chapter_id, course_id, "order", creator_id,
                    activity_uuid, creation_date, update_date
                )
                VALUES (
                    1, 'Shared', 'TYPE_DYNAMIC', 'SUBTYPE_DYNAMIC_PAGE', '{}', '{}',
                    1, 1, 1, 0, 99, 'activity_shared',
                    '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00'
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO assignment (
                    id, assignment_uuid, title, description, due_date, published,
                    grading_type, course_id, chapter_id, activity_id,
                    creation_date, update_date
                )
                VALUES
                    (1, 'assignment_1', 'A1', '', '2026-01-02', 1, 'PERCENTAGE',
                     1, 1, 1, '2026-01-01T00:00:00+00:00',
                     '2026-01-01T00:00:00+00:00'),
                    (2, 'assignment_2', 'A2', '', '2026-01-02', 1, 'PERCENTAGE',
                     1, 1, 1, '2026-01-01T00:00:00+00:00',
                     '2026-01-01T00:00:00+00:00')
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO assignmenttask (
                    id, assignment_task_uuid, title, description, hint,
                    assignment_type, contents, max_grade_value, "order",
                    assignment_id, course_id, chapter_id, activity_id,
                    creation_date, update_date
                )
                VALUES
                    (1, 'task_1', 'T1', '', '', 'FORM', '{}', 100, 0, 1, 1, 1, 1,
                     '2026-01-01T00:00:00+00:00',
                     '2026-01-01T00:00:00+00:00'),
                    (2, 'task_2', 'T2', '', '', 'FORM', '{}', 100, 0, 2, 1, 1, 1,
                     '2026-01-01T00:00:00+00:00',
                     '2026-01-01T00:00:00+00:00')
                """
            )
        )

        migration._ensure_assignment_activities(conn)

        rows = (
            conn
            .execute(text("SELECT id, activity_id FROM assignment ORDER BY id"))
            .mappings()
            .all()
        )
        assert rows[0]["activity_id"] != rows[1]["activity_id"]
        activities = (
            conn
            .execute(text("SELECT activity_type FROM activity ORDER BY id"))
            .scalars()
            .all()
        )
        assert activities == ["TYPE_ASSIGNMENT", "TYPE_ASSIGNMENT"]


def test_phase2_backfill_creates_unified_submission_with_zero_grade() -> None:
    migration = load_migration_module()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    with engine.begin() as conn:
        create_schema(conn)
        conn.execute(text("INSERT INTO course (id, creator_id) VALUES (1, 99)"))
        conn.execute(
            text(
                """
                INSERT INTO activity (
                    id, name, activity_type, activity_sub_type, content, details,
                    published, chapter_id, course_id, "order", creator_id,
                    activity_uuid, creation_date, update_date
                )
                VALUES (
                    1, 'Assignment', 'TYPE_ASSIGNMENT', 'SUBTYPE_ASSIGNMENT_ANY',
                    '{}', '{}', 1, 1, 1, 0, 99, 'activity_1',
                    '2026-01-01T00:00:00+00:00',
                    '2026-01-01T00:00:00+00:00'
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO assignment (
                    id, assignment_uuid, title, description, due_date, published,
                    grading_type, course_id, chapter_id, activity_id,
                    creation_date, update_date
                )
                VALUES (
                    1, 'assignment_1', 'A1', '', '2026-01-02', 1, 'PERCENTAGE',
                    1, 1, 1, '2026-01-01T00:00:00+00:00',
                    '2026-01-01T00:00:00+00:00'
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO assignmenttask (
                    id, assignment_task_uuid, title, description, hint,
                    assignment_type, contents, max_grade_value, "order",
                    assignment_id, course_id, chapter_id, activity_id,
                    creation_date, update_date
                )
                VALUES (
                    1, 'task_file', 'File', '', '', 'FILE_SUBMISSION', '{}', 100,
                    0, 1, 1, 1, 1, '2026-01-01T00:00:00+00:00',
                    '2026-01-01T00:00:00+00:00'
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO assignmentusersubmission (
                    id, assignmentusersubmission_uuid, submission_status, grade,
                    user_id, assignment_id, submitted_at, graded_at,
                    creation_date, update_date
                )
                VALUES (
                    1, 'aus_1', 'GRADED', 0, 7, 1,
                    '2026-01-01T10:00:00+00:00',
                    '2026-01-01T12:00:00+00:00',
                    '2026-01-01T10:00:00+00:00',
                    '2026-01-01T12:00:00+00:00'
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO assignmenttasksubmission (
                    id, assignment_task_submission_uuid, task_submission, grade,
                    task_submission_grade_feedback, assignment_type, user_id,
                    activity_id, course_id, chapter_id, assignment_task_id,
                    creation_date, update_date
                )
                VALUES (
                    1, 'ats_1', :task_submission, 0, '', 'FILE_SUBMISSION', 7,
                    1, 1, 1, 1, '2026-01-01T10:00:00+00:00',
                    '2026-01-01T12:00:00+00:00'
                )
                """
            ),
            {"task_submission": json.dumps({"fileUUID": "file_1.pdf"})},
        )

        migration._backfill_due_at(conn)
        migration._backfill_unified_assignment_submissions(conn)

        row = conn.execute(text("SELECT * FROM submission")).mappings().one()
        assert row["status"] == "GRADED"
        assert row["final_score"] == 0
        assert row["graded_at"] is not None

        answers = json.loads(row["answers_json"])
        assert answers["tasks"][0]["file_key"] == "file_1.pdf"

        grading = json.loads(row["grading_json"])
        item = grading["items"][0]
        assert item["score"] == 0
        assert item["needs_manual_review"] is False
        assert item["legacy_graded"] is True
