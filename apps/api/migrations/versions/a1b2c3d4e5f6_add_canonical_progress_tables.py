"""Add canonical assessment policy and progress tables.

Revision ID: a1b2c3d4e5f6
Revises: z6a7b8c9d0e1
Create Date: 2026-04-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "z6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assessment_policy",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("policy_uuid", sa.String(), nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=False),
        sa.Column("assessment_type", sa.String(), nullable=False),
        sa.Column("grading_mode", sa.String(), nullable=False),
        sa.Column("completion_rule", sa.String(), nullable=False),
        sa.Column("passing_score", sa.Float(), nullable=False, server_default="60"),
        sa.Column("max_attempts", sa.Integer(), nullable=True),
        sa.Column("time_limit_seconds", sa.Integer(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("allow_late", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "late_policy_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
        sa.Column(
            "settings_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["activity_id"], ["activity.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_id", name="uq_assessment_policy_activity_id"),
        sa.UniqueConstraint("policy_uuid", name="uq_assessment_policy_uuid"),
    )
    op.create_index(
        "ix_assessment_policy_activity_id", "assessment_policy", ["activity_id"]
    )
    op.create_index(
        "ix_assessment_policy_assessment_type",
        "assessment_policy",
        ["assessment_type"],
    )
    op.add_column(
        "submission",
        sa.Column("assessment_policy_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_submission_assessment_policy_id",
        "submission",
        "assessment_policy",
        ["assessment_policy_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_submission_policy_user_attempt",
        "submission",
        ["assessment_policy_id", "user_id", "attempt_number"],
    )

    op.create_table(
        "activity_progress",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(), nullable=False, server_default="NOT_STARTED"),
        sa.Column("required", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("passed", sa.Boolean(), nullable=True),
        sa.Column("best_submission_id", sa.Integer(), nullable=True),
        sa.Column("latest_submission_id", sa.Integer(), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("graded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_late", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "teacher_action_required",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column("status_reason", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["activity_id"], ["activity.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["best_submission_id"], ["submission.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["latest_submission_id"], ["submission.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_id", "user_id", name="uq_activity_progress_user"),
    )
    op.create_index(
        "ix_activity_progress_course_user",
        "activity_progress",
        ["course_id", "user_id"],
    )
    op.create_index(
        "ix_activity_progress_activity_state",
        "activity_progress",
        ["activity_id", "state"],
    )
    op.create_index(
        "ix_activity_progress_course_teacher_action",
        "activity_progress",
        ["course_id", "teacher_action_required"],
    )

    op.create_table(
        "course_progress",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "completed_required_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_required_count", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("progress_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("grade_average", sa.Float(), nullable=True),
        sa.Column(
            "missing_required_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "needs_grading_count", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "certificate_eligible",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_id", "user_id", name="uq_course_progress_user"),
    )
    op.create_index(
        "ix_course_progress_course_user", "course_progress", ["course_id", "user_id"]
    )

    _backfill_assessment_policies()
    _link_existing_submissions_to_policies()


def downgrade() -> None:
    op.drop_index("ix_course_progress_course_user", table_name="course_progress")
    op.drop_table("course_progress")

    op.drop_index(
        "ix_activity_progress_course_teacher_action", table_name="activity_progress"
    )
    op.drop_index("ix_activity_progress_activity_state", table_name="activity_progress")
    op.drop_index("ix_activity_progress_course_user", table_name="activity_progress")
    op.drop_table("activity_progress")

    op.drop_index("idx_submission_policy_user_attempt", table_name="submission")
    op.drop_constraint(
        "fk_submission_assessment_policy_id", "submission", type_="foreignkey"
    )
    op.drop_column("submission", "assessment_policy_id")

    op.drop_index(
        "ix_assessment_policy_assessment_type", table_name="assessment_policy"
    )
    op.drop_index("ix_assessment_policy_activity_id", table_name="assessment_policy")
    op.drop_table("assessment_policy")


def _backfill_assessment_policies() -> None:
    op.execute("""
        INSERT INTO assessment_policy (
            policy_uuid,
            activity_id,
            assessment_type,
            grading_mode,
            completion_rule,
            passing_score,
            max_attempts,
            time_limit_seconds,
            due_at,
            allow_late,
            late_policy_json,
            settings_json,
            created_at,
            updated_at
        )
        SELECT
            'policy_assignment_' || assignment.id::text,
            assignment.activity_id,
            'ASSIGNMENT',
            'MANUAL',
            'GRADED',
            60,
            NULL,
            NULL,
            assignment.due_at,
            TRUE,
            '{}'::json,
            json_build_object('assignment_id', assignment.id),
            COALESCE(assignment.created_at, now()),
            COALESCE(assignment.updated_at, now())
        FROM assignment
        WHERE assignment.activity_id IS NOT NULL
        ON CONFLICT (activity_id) DO NOTHING
    """)

    op.execute(r"""
        INSERT INTO assessment_policy (
            policy_uuid,
            activity_id,
            assessment_type,
            grading_mode,
            completion_rule,
            passing_score,
            max_attempts,
            time_limit_seconds,
            due_at,
            allow_late,
            late_policy_json,
            settings_json,
            created_at,
            updated_at
        )
        SELECT
            'policy_exam_' || exam.id::text,
            exam.activity_id,
            'EXAM',
            'AUTO_THEN_MANUAL',
            'PASSED',
            CASE
                WHEN (exam.settings ->> 'passing_score') ~ '^[0-9]+(\.[0-9]+)?$'
                    THEN (exam.settings ->> 'passing_score')::float
                ELSE 60
            END,
            CASE
                WHEN (exam.settings ->> 'attempt_limit') ~ '^[0-9]+$'
                    THEN (exam.settings ->> 'attempt_limit')::int
                ELSE NULL
            END,
            CASE
                WHEN (exam.settings ->> 'time_limit') ~ '^[0-9]+$'
                    THEN ((exam.settings ->> 'time_limit')::int * 60)
                ELSE NULL
            END,
            NULLIF(
                COALESCE(exam.settings ->> 'due_at', exam.settings ->> 'due_date_iso'),
                ''
            )::timestamptz,
            TRUE,
            '{}'::json,
            exam.settings,
            COALESCE(NULLIF(exam.creation_date, '')::timestamptz, now()),
            COALESCE(NULLIF(exam.update_date, '')::timestamptz, now())
        FROM exam
        WHERE exam.activity_id IS NOT NULL
        ON CONFLICT (activity_id) DO NOTHING
    """)

    op.execute(r"""
        WITH latest_quiz_block AS (
            SELECT DISTINCT ON (block.activity_id)
                block.id,
                block.activity_id,
                block.content,
                block.creation_date,
                block.update_date
            FROM block
            WHERE block.block_type = 'BLOCK_QUIZ'
            ORDER BY block.activity_id, block.id DESC
        )
        INSERT INTO assessment_policy (
            policy_uuid,
            activity_id,
            assessment_type,
            grading_mode,
            completion_rule,
            passing_score,
            max_attempts,
            time_limit_seconds,
            due_at,
            allow_late,
            late_policy_json,
            settings_json,
            created_at,
            updated_at
        )
        SELECT
            'policy_quiz_' || latest_quiz_block.activity_id::text,
            latest_quiz_block.activity_id,
            'QUIZ',
            'AUTO_THEN_MANUAL',
            'PASSED',
            60,
            CASE
                WHEN (latest_quiz_block.content -> 'settings' ->> 'max_attempts') ~ '^[0-9]+$'
                    THEN (latest_quiz_block.content -> 'settings' ->> 'max_attempts')::int
                ELSE NULL
            END,
            CASE
                WHEN (latest_quiz_block.content -> 'settings' ->> 'time_limit_seconds') ~ '^[0-9]+$'
                    THEN (latest_quiz_block.content -> 'settings' ->> 'time_limit_seconds')::int
                ELSE NULL
            END,
            NULLIF(
                latest_quiz_block.content -> 'settings' ->> 'due_date_iso',
                ''
            )::timestamptz,
            TRUE,
            '{}'::json,
            COALESCE(latest_quiz_block.content -> 'settings', '{}'::json),
            COALESCE(NULLIF(latest_quiz_block.creation_date, '')::timestamptz, now()),
            COALESCE(NULLIF(latest_quiz_block.update_date, '')::timestamptz, now())
        FROM latest_quiz_block
        ON CONFLICT (activity_id) DO NOTHING
    """)

    op.execute(r"""
        INSERT INTO assessment_policy (
            policy_uuid,
            activity_id,
            assessment_type,
            grading_mode,
            completion_rule,
            passing_score,
            max_attempts,
            time_limit_seconds,
            due_at,
            allow_late,
            late_policy_json,
            settings_json,
            created_at,
            updated_at
        )
        SELECT
            'policy_code_challenge_' || activity.id::text,
            activity.id,
            'CODE_CHALLENGE',
            'AUTO',
            'PASSED',
            60,
            NULL,
            CASE
                WHEN (activity.details ->> 'time_limit') ~ '^[0-9]+$'
                    THEN (activity.details ->> 'time_limit')::int
                ELSE NULL
            END,
            NULLIF(activity.details ->> 'due_date', '')::timestamptz,
            TRUE,
            '{}'::json,
            COALESCE(activity.details, '{}'::json),
            COALESCE(activity.creation_date, now()),
            COALESCE(activity.update_date, now())
        FROM activity
        WHERE activity.activity_type = 'TYPE_CODE_CHALLENGE'
        ON CONFLICT (activity_id) DO NOTHING
    """)


def _link_existing_submissions_to_policies() -> None:
    op.execute("""
        UPDATE submission
        SET assessment_policy_id = assessment_policy.id
        FROM assessment_policy
        WHERE submission.activity_id = assessment_policy.activity_id
          AND submission.assessment_policy_id IS NULL
    """)
