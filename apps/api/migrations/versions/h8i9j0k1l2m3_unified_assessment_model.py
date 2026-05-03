"""Add unified assessment and assessment item tables.

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-04-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "h8i9j0k1l2m3"
down_revision: str | None = "g7h8i9j0k1l2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ASSESSMENT_PERMISSIONS = (
    ("assessment:*:platform", "assessment", "*", "platform"),
    ("assessment:*:own", "assessment", "*", "own"),
    ("assessment:author:own", "assessment", "author", "own"),
    ("assessment:publish:own", "assessment", "publish", "own"),
    ("assessment:grade:own", "assessment", "grade", "own"),
    ("assessment:read:assigned", "assessment", "read", "assigned"),
    ("assessment:submit:assigned", "assessment", "submit", "assigned"),
)


def upgrade() -> None:
    op.create_table(
        "assessment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("assessment_uuid", sa.String(), nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("lifecycle", sa.String(), nullable=False, server_default="DRAFT"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column(
            "grading_type",
            sa.String(),
            nullable=False,
            server_default="PERCENTAGE",
        ),
        sa.Column("policy_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["activity_id"], ["activity.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["policy_id"],
            ["assessment_policy.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_assessment_uuid", "assessment", ["assessment_uuid"], unique=True
    )
    op.create_index(
        "ix_assessment_activity_id", "assessment", ["activity_id"], unique=True
    )
    op.create_index("ix_assessment_kind", "assessment", ["kind"], unique=False)
    op.create_index(
        "ix_assessment_lifecycle", "assessment", ["lifecycle"], unique=False
    )

    op.create_table(
        "assessment_item",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("item_uuid", sa.String(), nullable=False),
        sa.Column("assessment_id", sa.Integer(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False, server_default=""),
        sa.Column(
            "body_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
        sa.Column("max_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["assessment_id"], ["assessment.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_assessment_item_uuid",
        "assessment_item",
        ["item_uuid"],
        unique=True,
    )
    op.create_index(
        "ix_assessment_item_assessment_order",
        "assessment_item",
        ["assessment_id", "order"],
        unique=False,
    )
    op.create_table(
        "upload",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("upload_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False, server_default=""),
        sa.Column("content_type", sa.String(), nullable=False, server_default=""),
        sa.Column("size", sa.Integer(), nullable=True),
        sa.Column("sha256", sa.String(), nullable=True),
        sa.Column("key", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="CREATED"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("referenced_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_upload_upload_id", "upload", ["upload_id"], unique=True)
    op.create_index("ix_upload_user_status", "upload", ["user_id", "status"])

    _seed_permissions()
    _backfill_assessments()
    _backfill_items()
    _backfill_legacy_submissions()


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_upload_user_status")
    op.execute("DROP INDEX IF EXISTS ix_upload_upload_id")
    op.execute("DROP TABLE IF EXISTS upload")
    op.drop_index("ix_assessment_item_assessment_order", table_name="assessment_item")
    op.drop_index("ix_assessment_item_uuid", table_name="assessment_item")
    op.drop_table("assessment_item")
    op.drop_index("ix_assessment_lifecycle", table_name="assessment")
    op.drop_index("ix_assessment_kind", table_name="assessment")
    op.drop_index("ix_assessment_activity_id", table_name="assessment")
    op.drop_index("ix_assessment_uuid", table_name="assessment")
    op.drop_table("assessment")

    permission_list = [name for name, *_ in ASSESSMENT_PERMISSIONS]
    if permission_list:
        op.execute(
            sa.text("DELETE FROM permissions WHERE name IN :names").bindparams(
                sa.bindparam("names", expanding=True, value=permission_list)
            )
        )


def _seed_permissions() -> None:
    for name, resource, action, scope in ASSESSMENT_PERMISSIONS:
        op.execute(
            sa.text("""
                INSERT INTO permissions (name, resource_type, action, scope, created_at)
                VALUES (:name, :resource, :action, :scope, now())
                ON CONFLICT (name) DO NOTHING
            """).bindparams(
                name=name,
                resource=resource,
                action=action,
                scope=scope,
            )
        )

    role_permissions = {
        "maintainer": ["assessment:*:platform"],
        "instructor": [
            "assessment:*:own",
            "assessment:read:assigned",
            "assessment:grade:own",
        ],
        "user": ["assessment:submit:assigned", "assessment:read:assigned"],
    }
    for role_slug, permission_names in role_permissions.items():
        for permission_name in permission_names:
            op.execute(
                sa.text("""
                    INSERT INTO role_permissions (role_id, permission_id, granted_at)
                    SELECT roles.id, permissions.id, now()
                    FROM roles, permissions
                    WHERE roles.slug = :role_slug
                      AND permissions.name = :permission_name
                    ON CONFLICT DO NOTHING
                """).bindparams(
                    role_slug=role_slug,
                    permission_name=permission_name,
                )
            )


def _backfill_assessments() -> None:
    op.execute("""
        INSERT INTO assessment (
            assessment_uuid,
            activity_id,
            kind,
            title,
            description,
            lifecycle,
            scheduled_at,
            published_at,
            archived_at,
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
            assignment.scheduled_publish_at,
            assignment.published_at,
            assignment.archived_at,
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
    """)

    op.execute("""
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
            COALESCE(NULLIF(exam.creation_date, '')::timestamptz, now()),
            COALESCE(NULLIF(exam.update_date, '')::timestamptz, now())
        FROM exam
        LEFT JOIN assessment_policy
          ON assessment_policy.activity_id = exam.activity_id
        WHERE NOT EXISTS (
            SELECT 1 FROM assessment WHERE assessment.activity_id = exam.activity_id
        )
    """)

    op.execute("""
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
            COALESCE(NULLIF(activity.creation_date, '')::timestamptz, now()),
            COALESCE(NULLIF(activity.update_date, '')::timestamptz, now())
        FROM activity
        LEFT JOIN assessment_policy
          ON assessment_policy.activity_id = activity.id
        WHERE activity.activity_type = 'TYPE_CODE_CHALLENGE'
          AND NOT EXISTS (
              SELECT 1 FROM assessment WHERE assessment.activity_id = activity.id
          )
    """)


def _backfill_items() -> None:
    op.execute("""
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
    """)


def _backfill_legacy_submissions() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Backfill exam-based submissions only if legacy table exists
    if inspector.has_table("exam_attempt"):
        op.execute("""
        INSERT INTO submission (
            submission_uuid,
            assessment_type,
            activity_id,
            assessment_policy_id,
            user_id,
            auto_score,
            final_score,
            status,
            attempt_number,
            is_late,
            late_penalty_pct,
            answers_json,
            grading_json,
            metadata_json,
            started_at,
            submitted_at,
            graded_at,
            created_at,
            updated_at,
            grading_version,
            version
        )
        SELECT
            'submission_' || ranked.attempt_uuid,
            'EXAM',
            exam.activity_id,
            assessment_policy.id,
            ranked.user_id,
            ranked.score_percent,
            CASE WHEN ranked.status = 'IN_PROGRESS' THEN NULL ELSE ranked.score_percent END,
            CASE WHEN ranked.status = 'IN_PROGRESS' THEN 'DRAFT' ELSE 'GRADED' END,
            ranked.attempt_number,
            false,
            0,
            jsonb_build_object(
                'answers',
                COALESCE(ranked.answers::jsonb, '{}'::jsonb),
                'question_order',
                COALESCE(ranked.question_order::jsonb, '[]'::jsonb),
                'violations',
                COALESCE(ranked.violations::jsonb, '[]'::jsonb),
                'attempt_uuid',
                ranked.attempt_uuid,
                'status',
                ranked.status
            )::json,
            '{}'::json,
            jsonb_build_object(
                'legacy_exam_attempt_id',
                ranked.id,
                'legacy_attempt_uuid',
                ranked.attempt_uuid
            )::json,
            NULLIF(ranked.started_at, '')::timestamptz,
            NULLIF(ranked.submitted_at, '')::timestamptz,
            CASE
                WHEN ranked.status = 'IN_PROGRESS' THEN NULL
                ELSE NULLIF(ranked.submitted_at, '')::timestamptz
            END,
            COALESCE(NULLIF(ranked.creation_date, '')::timestamptz, now()),
            COALESCE(NULLIF(ranked.update_date, '')::timestamptz, now()),
            1,
            1
        FROM (
            SELECT
                exam_attempt.*,
                row_number() OVER (
                    PARTITION BY exam_attempt.exam_id, exam_attempt.user_id
                    ORDER BY exam_attempt.creation_date, exam_attempt.id
                ) AS attempt_number,
                CASE
                    WHEN exam_attempt.max_score IS NOT NULL
                         AND exam_attempt.max_score > 0
                        THEN (COALESCE(exam_attempt.score, 0)::float / exam_attempt.max_score::float) * 100.0
                    ELSE COALESCE(exam_attempt.score, 0)::float
                END AS score_percent
            FROM exam_attempt
            WHERE NOT exam_attempt.is_preview
        ) AS ranked
        JOIN exam ON exam.id = ranked.exam_id
        LEFT JOIN assessment_policy
          ON assessment_policy.activity_id = exam.activity_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM submission
            WHERE submission.submission_uuid = 'submission_' || ranked.attempt_uuid
        )
    """)

    # Backfill code challenge submissions only if legacy table exists
    if inspector.has_table("code_submission"):
        op.execute("""
        INSERT INTO submission (
            submission_uuid,
            assessment_type,
            activity_id,
            assessment_policy_id,
            user_id,
            auto_score,
            final_score,
            status,
            attempt_number,
            is_late,
            late_penalty_pct,
            answers_json,
            grading_json,
            metadata_json,
            started_at,
            submitted_at,
            graded_at,
            created_at,
            updated_at,
            grading_version,
            version
        )
        SELECT
            ranked.submission_uuid,
            'CODE_CHALLENGE',
            ranked.activity_id,
            assessment_policy.id,
            ranked.user_id,
            COALESCE(ranked.score, 0),
            CASE WHEN ranked.status = 'COMPLETED' THEN COALESCE(ranked.score, 0) ELSE NULL END,
            CASE WHEN ranked.status = 'COMPLETED' THEN 'GRADED' ELSE 'PENDING' END,
            ranked.attempt_number,
            false,
            0,
            jsonb_build_object(
                'kind',
                'CODE',
                'language',
                ranked.language_id,
                'language_name',
                ranked.language_name,
                'source',
                ranked.source_code,
                'code_submission_uuid',
                ranked.submission_uuid
            )::json,
            jsonb_build_object(
                'test_results',
                COALESCE(ranked.test_results::jsonb, '{}'::jsonb),
                'passed_tests',
                ranked.passed_tests,
                'total_tests',
                ranked.total_tests
            )::json,
            jsonb_build_object(
                'code_submission_id',
                ranked.id,
                'code_submission_uuid',
                ranked.submission_uuid,
                'plagiarism_score',
                ranked.plagiarism_score,
                'judge0_tokens',
                COALESCE(ranked.judge0_tokens::jsonb, '[]'::jsonb)
            )::json,
            COALESCE(NULLIF(ranked.created_at, '')::timestamptz, now()),
            COALESCE(NULLIF(ranked.updated_at, '')::timestamptz, NULLIF(ranked.created_at, '')::timestamptz, now()),
            CASE
                WHEN ranked.status = 'COMPLETED'
                    THEN COALESCE(NULLIF(ranked.updated_at, '')::timestamptz, NULLIF(ranked.created_at, '')::timestamptz, now())
                ELSE NULL
            END,
            COALESCE(NULLIF(ranked.created_at, '')::timestamptz, now()),
            COALESCE(NULLIF(ranked.updated_at, '')::timestamptz, NULLIF(ranked.created_at, '')::timestamptz, now()),
            1,
            1
        FROM (
            SELECT
                code_submission.*,
                row_number() OVER (
                    PARTITION BY code_submission.activity_id, code_submission.user_id
                    ORDER BY code_submission.created_at, code_submission.id
                ) AS attempt_number
            FROM code_submission
        ) AS ranked
        LEFT JOIN assessment_policy
          ON assessment_policy.activity_id = ranked.activity_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM submission
            WHERE submission.submission_uuid = ranked.submission_uuid
        )
    """)

    # Create grading entries for any submissions we now have
    op.execute("""
        INSERT INTO grading_entry (
            entry_uuid,
            submission_id,
            graded_by,
            raw_score,
            penalty_pct,
            final_score,
            breakdown,
            overall_feedback,
            grading_version,
            created_at,
            published_at
        )
        SELECT
            'entry_' || submission.submission_uuid || '_legacy',
            submission.id,
            NULL,
            COALESCE(submission.final_score, submission.auto_score, 0),
            COALESCE(submission.late_penalty_pct, 0),
            COALESCE(submission.final_score, submission.auto_score, 0),
            COALESCE(submission.grading_json, '{}'::json),
            '',
            submission.grading_version,
            COALESCE(submission.graded_at, submission.submitted_at, submission.updated_at, now()),
            NULL
        FROM submission
        WHERE submission.assessment_type IN ('EXAM', 'CODE_CHALLENGE')
          AND submission.status IN ('GRADED', 'PUBLISHED')
          AND NOT EXISTS (
              SELECT 1
              FROM grading_entry
              WHERE grading_entry.entry_uuid = 'entry_' || submission.submission_uuid || '_legacy'
          )
    """)

    # Backfill question-based assessment items only if legacy table exists
    if inspector.has_table("question"):
        op.execute("""
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
            question.question_uuid,
            assessment.id,
            question.order_index,
            CASE
                WHEN question.question_type = 'MATCHING' THEN 'MATCHING'
                ELSE 'CHOICE'
            END,
            LEFT(question.question_text, 255),
            CASE
                WHEN question.question_type = 'MATCHING'
                    THEN json_build_object(
                        'kind', 'MATCHING',
                        'prompt', question.question_text,
                        'pairs', '[]'::json
                    )
                ELSE json_build_object(
                    'kind', 'CHOICE',
                    'prompt', question.question_text,
                    'options', '[]'::json,
                    'multiple', question.question_type = 'MULTIPLE_CHOICE'
                )
            END,
            question.points,
            COALESCE(NULLIF(question.creation_date, '')::timestamptz, now()),
            COALESCE(NULLIF(question.update_date, '')::timestamptz, now())
        FROM question
        JOIN exam ON exam.id = question.exam_id
        JOIN assessment ON assessment.activity_id = exam.activity_id
        WHERE assessment.kind = 'EXAM'
          AND NOT EXISTS (
              SELECT 1
              FROM assessment_item
              WHERE assessment_item.item_uuid = question.question_uuid
          )
    """)

    # Backfill code challenge assessment items from activity (activity should exist)
    op.execute("""
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
            COALESCE(NULLIF(activity.creation_date, '')::timestamptz, now()),
            COALESCE(NULLIF(activity.update_date, '')::timestamptz, now())
        FROM activity
        JOIN assessment ON assessment.activity_id = activity.id
        WHERE assessment.kind = 'CODE_CHALLENGE'
          AND NOT EXISTS (
              SELECT 1
              FROM assessment_item
              WHERE assessment_item.item_uuid = 'item_' || activity.activity_uuid
          )
    """)
