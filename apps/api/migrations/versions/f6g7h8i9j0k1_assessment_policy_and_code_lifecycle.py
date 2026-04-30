"""Add assessment anti-cheat policy and code challenge lifecycle.

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-04-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f6g7h8i9j0k1"
down_revision: str | None = "e5f6g7h8i9j0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "assessment_policy",
        sa.Column(
            "anti_cheat_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'::json"),
        ),
    )

    op.execute("""
        UPDATE assessment_policy
        SET anti_cheat_json = json_build_object(
            'copy_paste_protection', COALESCE((exam.settings ->> 'copy_paste_protection')::boolean, false),
            'tab_switch_detection', COALESCE((exam.settings ->> 'tab_switch_detection')::boolean, false),
            'devtools_detection', COALESCE((exam.settings ->> 'devtools_detection')::boolean, false),
            'right_click_disable', COALESCE((exam.settings ->> 'right_click_disable')::boolean, false),
            'fullscreen_enforcement', COALESCE((exam.settings ->> 'fullscreen_enforcement')::boolean, false),
            'violation_threshold',
                CASE
                    WHEN (exam.settings ->> 'violation_threshold') ~ '^[0-9]+$'
                        THEN (exam.settings ->> 'violation_threshold')::int
                    ELSE NULL
                END
        )
        FROM exam
        WHERE assessment_policy.activity_id = exam.activity_id
          AND assessment_policy.assessment_type = 'EXAM'
    """)

    op.execute("""
        UPDATE assignmenttask
        SET contents = jsonb_set(
            contents::jsonb,
            '{settings}',
            (
                (COALESCE(contents::jsonb -> 'settings', '{}'::jsonb))
                - 'prevent_copy'
                - 'track_violations'
                - 'max_violations'
                - 'block_on_violations'
            )
        )::json
        WHERE assignment_type = 'QUIZ'
          AND contents IS NOT NULL
          AND contents::jsonb ? 'settings'
    """)

    op.execute("""
        UPDATE activity
        SET details = (
            COALESCE(details::jsonb, '{}'::jsonb)
            || jsonb_build_object(
                'lifecycle_status',
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM submission
                        WHERE submission.activity_id = activity.id
                    ) THEN 'PUBLISHED'
                    ELSE 'DRAFT'
                END
            )
        )::json
        WHERE activity_type = 'TYPE_CODE_CHALLENGE'
          AND NOT (COALESCE(details::jsonb, '{}'::jsonb) ? 'lifecycle_status')
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE activity
        SET details = (COALESCE(details::jsonb, '{}'::jsonb) - 'lifecycle_status')::json
        WHERE activity_type = 'TYPE_CODE_CHALLENGE'
    """)
    op.drop_column("assessment_policy", "anti_cheat_json")
