"""Finalize assessment grading canonicalization.

Revision ID: d9a1c7e5b402
Revises: c8f2d4a91e6b
Create Date: 2026-05-13
"""

from __future__ import annotations

from collections.abc import Iterable

import sqlalchemy as sa
from alembic import op

revision = "d9a1c7e5b402"
down_revision = "c8f2d4a91e6b"
branch_labels = None
depends_on = None


LEGACY_ACTIVITY_TYPES = (
    "TYPE_ASSIGNMENT",
    "TYPE_EXAM",
    "TYPE_CODE_CHALLENGE",
)

LEGACY_TABLES = (
    "assignmenttasksubmission",
    "assignmentusersubmission",
    "quiz_attempt",
    "exam_attempt",
    "code_submission",
    "question",
    "assignmenttask",
    "assignment_task",
    "assignment",
)

LEGACY_METADATA_KEYS = (
    "legacy_activity_uuid",
    "legacy_assignment_uuid",
    "legacy_assignment_task_uuid",
    "legacy_assignment_task_id",
    "legacy_submission_uuid",
    "legacy_submission_id",
    "legacy_attempt_uuid",
    "legacy_attempt_id",
    "legacy_question_uuid",
    "legacy_question_id",
    "legacy_grading_route",
    "legacy_answer_path",
)


def _table_exists(conn: sa.Connection, table_name: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = current_schema()
                      AND table_name = :table_name
                )
                """
            ),
            {"table_name": table_name},
        ).scalar()
    )


def _column_exists(conn: sa.Connection, table_name: str, column_name: str) -> bool:
    return bool(
        conn.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = :table_name
                      AND column_name = :column_name
                )
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        ).scalar()
    )


def _first_existing_column(conn: sa.Connection, table_name: str, columns: Iterable[str]) -> str | None:
    for column in columns:
        if _column_exists(conn, table_name, column):
            return column
    return None


def _assert_no_unmapped_activity_types(conn: sa.Connection) -> None:
    rows = conn.execute(
        sa.text(
            """
            SELECT activity.id, activity.activity_uuid, activity.activity_type, COUNT(assessment.id) AS assessment_count
            FROM activity
            LEFT JOIN assessment ON assessment.activity_id = activity.id
            WHERE activity.activity_type::text IN :activity_types
            GROUP BY activity.id, activity.activity_uuid, activity.activity_type
            HAVING COUNT(assessment.id) <> 1
            LIMIT 20
            """
        ).bindparams(sa.bindparam("activity_types", expanding=True)),
        {"activity_types": LEGACY_ACTIVITY_TYPES},
    ).fetchall()
    if rows:
        formatted = ", ".join(
            f"{row.activity_type}:{row.activity_uuid or row.id}({row.assessment_count})" for row in rows
        )
        msg = (
            "Cannot finalize assessment grading while legacy activities are not "
            f"one-to-one with assessments: {formatted}"
        )
        raise RuntimeError(msg)


def _assert_legacy_submissions_have_canonical_rows(conn: sa.Connection) -> None:
    checks: list[str] = []

    if _table_exists(conn, "assignmentusersubmission") and _table_exists(conn, "assignment"):
        activity_col = _first_existing_column(conn, "assignment", ("activity_id",))
        assignment_fk = _first_existing_column(
            conn,
            "assignmentusersubmission",
            ("assignment_id", "assignmentId"),
        )
        user_col = _first_existing_column(conn, "assignmentusersubmission", ("user_id", "userId"))
        if activity_col and assignment_fk and user_col:
            checks.append(
                f"""
                SELECT aus.id
                FROM assignmentusersubmission aus
                JOIN assignment a ON a.id = aus.{assignment_fk}
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM submission s
                    WHERE s.activity_id = a.{activity_col}
                      AND s.user_id = aus.{user_col}
                      AND s.status <> 'DRAFT'
                )
                LIMIT 1
                """
            )

    if _table_exists(conn, "assignmenttasksubmission"):
        activity_col = _first_existing_column(conn, "assignmenttasksubmission", ("activity_id",))
        user_col = _first_existing_column(conn, "assignmenttasksubmission", ("user_id", "userId"))
        if activity_col and user_col:
            checks.append(
                f"""
                SELECT ats.id
                FROM assignmenttasksubmission ats
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM submission s
                    WHERE s.activity_id = ats.{activity_col}
                      AND s.user_id = ats.{user_col}
                      AND s.status <> 'DRAFT'
                )
                LIMIT 1
                """
            )

    if _table_exists(conn, "exam_attempt") and _table_exists(conn, "exam"):
        exam_fk = _first_existing_column(conn, "exam_attempt", ("exam_id", "examId"))
        user_col = _first_existing_column(conn, "exam_attempt", ("user_id", "userId"))
        activity_col = _first_existing_column(conn, "exam", ("activity_id",))
        if exam_fk and user_col and activity_col:
            checks.append(
                f"""
                SELECT ea.id
                FROM exam_attempt ea
                JOIN exam e ON e.id = ea.{exam_fk}
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM submission s
                    WHERE s.activity_id = e.{activity_col}
                      AND s.user_id = ea.{user_col}
                      AND s.status <> 'DRAFT'
                )
                LIMIT 1
                """
            )

    if _table_exists(conn, "code_submission"):
        activity_col = _first_existing_column(conn, "code_submission", ("activity_id",))
        user_col = _first_existing_column(conn, "code_submission", ("user_id", "userId"))
        if activity_col and user_col:
            checks.append(
                f"""
                SELECT cs.id
                FROM code_submission cs
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM submission s
                    WHERE s.activity_id = cs.{activity_col}
                      AND s.user_id = cs.{user_col}
                      AND s.status <> 'DRAFT'
                )
                LIMIT 1
                """
            )

    if _table_exists(conn, "quiz_attempt"):
        checks.append("SELECT id FROM quiz_attempt LIMIT 1")

    for check_sql in checks:
        row = conn.execute(sa.text(check_sql)).first()
        if row:
            raise RuntimeError(
                "Cannot drop legacy submission tables while unmapped legacy rows remain. "
                "Run the one-time canonical migration before this finalization migration."
            )


def _strip_legacy_metadata_keys() -> None:
    removal_expr = " ".join(f"- '{key}'" for key in LEGACY_METADATA_KEYS)
    op.execute(
        sa.text(
            f"""
            UPDATE submission
            SET metadata_json = (COALESCE(metadata_json, '{{}}'::json)::jsonb {removal_expr})::json
            WHERE metadata_json IS NOT NULL
            """
        )
    )


def _backfill_remaining_assessments(conn: sa.Connection) -> None:
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # 1. Assignments
    if "assignment" in existing_tables:
        conn.execute(
            sa.text(
                """
            INSERT INTO assessment (
                assessment_uuid,
                activity_id,
                kind,
                title,
                description,
                lifecycle,
                weight,
                grading_type,
                policy_id,
                created_at,
                updated_at
            )
            SELECT
                'assessment_' || assignment.assignment_uuid,
                assignment.activity_id,
                'ASSIGNMENT',
                assignment.title,
                assignment.description,
                assignment.status,
                assignment.weight,
                assignment.grading_type,
                assessment_policy.id,
                assignment.created_at,
                assignment.updated_at
            FROM assignment
            LEFT JOIN assessment_policy
              ON assessment_policy.activity_id = assignment.activity_id
            WHERE NOT EXISTS (
                SELECT 1 FROM assessment WHERE assessment.activity_id = assignment.activity_id
            )
        """
            )
        )

    # 2. Exams
    if "exam" in existing_tables:
        conn.execute(
            sa.text(
                """
            INSERT INTO assessment (
                assessment_uuid,
                activity_id,
                kind,
                title,
                description,
                lifecycle,
                weight,
                grading_type,
                policy_id,
                created_at,
                updated_at
            )
            SELECT
                'assessment_' || exam.exam_uuid,
                exam.activity_id,
                'EXAM',
                exam.title,
                exam.description,
                CASE
                    WHEN exam.settings ->> 'lifecycle_status' IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')
                        THEN exam.settings ->> 'lifecycle_status'
                    WHEN exam.published THEN 'PUBLISHED'
                    ELSE 'DRAFT'
                END,
                1.0,
                'PERCENTAGE',
                assessment_policy.id,
                COALESCE(NULLIF(exam.creation_date::text, '')::timestamptz, now()),
                COALESCE(NULLIF(exam.update_date::text, '')::timestamptz, now())
            FROM exam
            LEFT JOIN assessment_policy
              ON assessment_policy.activity_id = exam.activity_id
            WHERE NOT EXISTS (
                SELECT 1 FROM assessment WHERE assessment.activity_id = exam.activity_id
            )
        """
            )
        )

    # 3. Code Challenges
    conn.execute(
        sa.text(
            """
        INSERT INTO assessment (
            assessment_uuid,
            activity_id,
            kind,
            title,
            description,
            lifecycle,
            weight,
            grading_type,
            policy_id,
            created_at,
            updated_at
        )
        SELECT
            'assessment_' || activity.activity_uuid,
            activity.id,
            'CODE_CHALLENGE',
            activity.name,
            '',
            CASE
                WHEN activity.details ->> 'lifecycle_status' IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')
                    THEN activity.details ->> 'lifecycle_status'
                WHEN activity.published THEN 'PUBLISHED'
                ELSE 'DRAFT'
            END,
            1.0,
            'PERCENTAGE',
            assessment_policy.id,
            COALESCE(NULLIF(activity.creation_date::text, '')::timestamptz, now()),
            COALESCE(NULLIF(activity.update_date::text, '')::timestamptz, now())
        FROM activity
        LEFT JOIN assessment_policy
          ON assessment_policy.activity_id = activity.id
        WHERE activity.activity_type::text = 'TYPE_CODE_CHALLENGE'
          AND NOT EXISTS (
              SELECT 1 FROM assessment WHERE assessment.activity_id = activity.id
          )
    """
        )
    )

    # 4. Assessment Items (from AssignmentTasks)
    if "assignmenttask" in existing_tables:
        conn.execute(
            sa.text(
                """
            INSERT INTO assessment_item (
                item_uuid,
                assessment_id,
                "order",
                kind,
                title,
                body_json,
                max_score,
                created_at,
                updated_at
            )
            SELECT
                assignmenttask.assignment_task_uuid,
                assessment.id,
                assignmenttask."order",
                CASE
                    WHEN assignmenttask.assignment_type = 'FILE_SUBMISSION' THEN 'FILE_UPLOAD'
                    WHEN assignmenttask.assignment_type = 'FORM' THEN 'FORM'
                    WHEN assignmenttask.assignment_type = 'QUIZ' THEN 'CHOICE'
                    ELSE 'OPEN_TEXT'
                END,
                assignmenttask.title,
                CASE
                    WHEN assignmenttask.assignment_type = 'FILE_SUBMISSION'
                        THEN json_build_object(
                            'kind', 'FILE_UPLOAD',
                            'prompt', COALESCE(assignmenttask.description, ''),
                            'max_files',
                                CASE
                                    WHEN assignmenttask.contents ->> 'max_files' ~ '^[0-9]+$'
                                        THEN (assignmenttask.contents ->> 'max_files')::int
                                    ELSE 1
                                END,
                            'max_mb',
                                CASE
                                    WHEN assignmenttask.contents ->> 'max_file_size_mb' ~ '^[0-9]+$'
                                        THEN (assignmenttask.contents ->> 'max_file_size_mb')::int
                                    ELSE NULL
                                END,
                            'mimes', COALESCE(assignmenttask.contents -> 'allowed_mime_types', '[]'::json)
                        )
                    WHEN assignmenttask.assignment_type = 'FORM'
                        THEN json_build_object(
                            'kind', 'FORM',
                            'prompt', COALESCE(assignmenttask.description, ''),
                            'fields', '[]'::json
                        )
                    WHEN assignmenttask.assignment_type = 'QUIZ'
                        THEN json_build_object(
                            'kind', 'CHOICE',
                            'prompt', COALESCE(assignmenttask.description, ''),
                            'options', '[]'::json,
                            'multiple', false
                        )
                    ELSE json_build_object(
                        'kind', 'OPEN_TEXT',
                        'prompt', COALESCE(assignmenttask.description, ''),
                        'rubric', NULL
                    )
                END,
                assignmenttask.max_grade_value,
                assignmenttask.created_at,
                assignmenttask.updated_at
            FROM assignmenttask
            JOIN assessment ON assessment.activity_id = assignmenttask.activity_id
            WHERE assessment.kind = 'ASSIGNMENT'
              AND NOT EXISTS (
                  SELECT 1
                  FROM assessment_item
                  WHERE assessment_item.item_uuid = assignmenttask.assignment_task_uuid
              )
        """
            )
        )

    # 5. Code Challenge Assessment Items
    conn.execute(
        sa.text(
            """
        INSERT INTO assessment_item (
            item_uuid,
            assessment_id,
            "order",
            kind,
            title,
            body_json,
            max_score,
            created_at,
            updated_at
        )
        SELECT
            'item_' || activity.activity_uuid,
            assessment.id,
            0,
            'CODE',
            activity.name,
            json_build_object(
                'kind', 'CODE',
                'prompt', COALESCE(activity.content ->> 'prompt', ''),
                'languages', COALESCE(activity.details -> 'allowed_languages', '[]'::json),
                'starter_code', COALESCE(activity.details -> 'starter_code', '{}'::json),
                'tests',
                    COALESCE(activity.details -> 'visible_tests', '[]'::json)::jsonb
                    || COALESCE(activity.details -> 'hidden_tests', '[]'::json)::jsonb,
                'time_limit_seconds',
                    CASE
                        WHEN activity.details ->> 'time_limit' ~ '^[0-9]+$'
                            THEN (activity.details ->> 'time_limit')::int
                        ELSE NULL
                    END,
                'memory_limit_mb',
                    CASE
                        WHEN activity.details ->> 'memory_limit' ~ '^[0-9]+$'
                            THEN (activity.details ->> 'memory_limit')::int
                        ELSE NULL
                    END
            ),
            CASE
                WHEN activity.details ->> 'points' ~ '^[0-9]+$'
                    THEN (activity.details ->> 'points')::float
                ELSE 100.0
            END,
            COALESCE(NULLIF(activity.creation_date::text, '')::timestamptz, now()),
            COALESCE(NULLIF(activity.update_date::text, '')::timestamptz, now())
        FROM activity
        JOIN assessment ON assessment.activity_id = activity.id
        WHERE assessment.kind = 'CODE_CHALLENGE'
          AND NOT EXISTS (
              SELECT 1
              FROM assessment_item
              WHERE assessment_item.item_uuid = 'item_' || activity.activity_uuid
          )
    """
        )
    )


def upgrade() -> None:
    conn = op.get_bind()

    _backfill_remaining_assessments(conn)
    _assert_no_unmapped_activity_types(conn)
    _assert_legacy_submissions_have_canonical_rows(conn)

    _strip_legacy_metadata_keys()

    conn = op.get_bind()
    submission_cols = {col["name"] for col in sa.inspect(conn).get_columns("submission")}
    if "raw_grading_json" not in submission_cols:
        op.add_column(
            "submission",
            sa.Column(
                "raw_grading_json",
                sa.JSON(),
                server_default=sa.text("'{}'::json"),
                nullable=False,
            ),
        )
        op.execute(
            sa.text(
                """
                UPDATE submission
                SET raw_grading_json = COALESCE(grading_json, '{}'::json)
                """
            )
        )

    if _table_exists(conn, "grading_entry"):
        grading_cols = {col["name"] for col in sa.inspect(conn).get_columns("grading_entry")}
        if "raw_breakdown" not in grading_cols:
            op.add_column(
                "grading_entry",
                sa.Column(
                    "raw_breakdown",
                    sa.JSON(),
                    server_default=sa.text("'{}'::json"),
                    nullable=False,
                ),
            )
        if "effective_breakdown" not in grading_cols:
            op.add_column(
                "grading_entry",
                sa.Column(
                    "effective_breakdown",
                    sa.JSON(),
                    server_default=sa.text("'{}'::json"),
                    nullable=False,
                ),
            )
        if "breakdown" in grading_cols:
            op.execute(
                sa.text(
                    """
                    UPDATE grading_entry
                    SET raw_breakdown = COALESCE(breakdown, '{}'::json),
                        effective_breakdown = COALESCE(breakdown, '{}'::json)
                    """
                )
            )

    for table_name in LEGACY_TABLES:
        op.execute(sa.text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))


def downgrade() -> None:
    op.drop_column("grading_entry", "effective_breakdown")
    op.drop_column("grading_entry", "raw_breakdown")
    op.drop_column("submission", "raw_grading_json")
