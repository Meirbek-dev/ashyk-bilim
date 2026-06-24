"""Consolidate assessment settings and submission metadata.

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-04-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g7h8i9j0k1l2"
down_revision: str | None = "f6g7h8i9j0k1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    activity_cols = {col["name"] for col in sa.inspect(conn).get_columns("activity")}
    if "settings" not in activity_cols:
        op.add_column(
            "activity",
            sa.Column(
                "settings",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'{}'::json"),
            ),
        )
    submission_cols = {col["name"] for col in sa.inspect(conn).get_columns("submission")}
    if "metadata_json" not in submission_cols:
        op.add_column(
            "submission",
            sa.Column(
                "metadata_json",
                sa.JSON(),
                nullable=False,
                server_default=sa.text("'{}'::json"),
            ),
        )

    op.execute("""
        UPDATE activity
        SET settings = (
            jsonb_build_object('kind', 'EXAM') || COALESCE(exam.settings::jsonb, '{}'::jsonb)
        )::json
        FROM exam
        WHERE exam.activity_id = activity.id
          AND activity.activity_type = 'TYPE_EXAM'
    """)

    op.execute("""
        UPDATE activity
        SET settings = (
            jsonb_build_object('kind', 'CODE_CHALLENGE')
            || COALESCE(activity.details::jsonb, '{}'::jsonb)
        )::json
        WHERE activity.activity_type = 'TYPE_CODE_CHALLENGE'
    """)

    op.execute("""
        UPDATE activity
        SET settings = (
            jsonb_build_object('kind', 'ASSIGNMENT')
            || COALESCE(activity.details::jsonb, '{}'::jsonb)
        )::json
        WHERE activity.activity_type = 'TYPE_ASSIGNMENT'
    """)

    op.execute("""
        UPDATE activity
        SET settings = (
            jsonb_build_object(
                'kind',
                'QUIZ',
                'questions',
                COALESCE(block.content::jsonb -> 'questions', '[]'::jsonb)
            )
            || COALESCE(block.content::jsonb -> 'settings', '{}'::jsonb)
        )::json
        FROM block
        WHERE block.activity_id = activity.id
          AND block.block_type = 'BLOCK_QUIZ'
    """)

    op.execute("""
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
            'submission_' || quiz_attempt.attempt_uuid,
            'QUIZ',
            quiz_attempt.activity_id,
            quiz_attempt.user_id,
            quiz_attempt.score,
            quiz_attempt.score,
            'GRADED',
            quiz_attempt.attempt_number,
            false,
            0,
            COALESCE(quiz_attempt.answers::jsonb, '{}'::jsonb)::json,
            COALESCE(quiz_attempt.grading_result::jsonb, '{}'::jsonb)::json,
            jsonb_build_object(
                'legacy_quiz_attempt_id',
                quiz_attempt.id,
                'legacy_attempt_uuid',
                quiz_attempt.attempt_uuid
            )::json,
            quiz_attempt.start_ts,
            quiz_attempt.end_ts,
            quiz_attempt.end_ts,
            COALESCE(quiz_attempt.start_ts, now()),
            COALESCE(quiz_attempt.end_ts, quiz_attempt.start_ts, now()),
            1,
            1
        FROM quiz_attempt
        WHERE NOT EXISTS (
            SELECT 1
            FROM submission
            WHERE submission.submission_uuid = 'submission_' || quiz_attempt.attempt_uuid
        )
    """)

    op.execute("""
        COMMENT ON COLUMN exam.settings IS
        'Compatibility storage for older exam routes. Canonical assessment settings live on activity.settings.'
    """)
    op.execute("""
        COMMENT ON TABLE quiz_attempt IS
        'Deprecated compatibility table. Existing rows are backfilled into submission; drop after two releases.'
    """)


def downgrade() -> None:
    op.execute("COMMENT ON TABLE quiz_attempt IS NULL")
    op.execute("COMMENT ON COLUMN exam.settings IS NULL")
    op.drop_column("submission", "metadata_json")
    op.drop_column("activity", "settings")
