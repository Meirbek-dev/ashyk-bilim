
"""Drop legacy breakdown column from grading_entry.

The ``breakdown`` column was the original grading detail JSON field. It has been
superseded by ``raw_breakdown`` (immutable grader output) and
``effective_breakdown`` (penalty-adjusted result). All code paths now write to
and read from the new columns exclusively.

This migration:
  1. Drops the ``breakdown`` column from ``grading_entry``.
  2. Strips any remaining ``legacy_*`` keys from ``submission.metadata_json``.
  3. Drops the ``grading_entry.breakdown`` column (no longer referenced by any
     model or API response).

Revision ID: 3f7c1d8a9b2e
Revises: ce32ea3953ee
Create Date: 2026-05-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3f7c1d8a9b2e"
down_revision: str | None = "ce32ea3953ee"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Any remaining legacy keys that may linger in submission.metadata_json
_LEGACY_METADATA_KEYS: tuple[str, ...] = (
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
    "legacy_code_submission_id",
    "legacy_plagiarism_score",
    "legacy_assignment_type",
    "legacy_task_submission_uuid",
    "assignment_uuid",
    "assignment_id",
    "assignment_task_id",
    "assignment_task_uuid",
    "assignment_type",
    "legacy_assignment_id",
)


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. Drop the legacy breakdown column ──────────────────────────────────
    inspector = sa.inspect(conn)
    columns = {col["name"] for col in inspector.get_columns("grading_entry")}
    if "breakdown" in columns:
        op.drop_column("grading_entry", "breakdown")

    # ── 2. Final sweep of legacy metadata keys from submission ────────────────
    removal_expr = " ".join(f"- '{key}'" for key in _LEGACY_METADATA_KEYS)
    op.execute(
        sa.text(
            f"""
            UPDATE submission
            SET metadata_json = (COALESCE(metadata_json, '{{}}'::json)::jsonb {removal_expr})::json
            WHERE metadata_json IS NOT NULL
              AND metadata_json::text LIKE '%legacy_%'
            """
        )
    )

    # ── 3. Drop any remaining legacy tables that somehow survived ─────────────
    legacy_tables = (
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
    for table_name in legacy_tables:
        op.execute(sa.text(f'DROP TABLE IF EXISTS "{table_name}" CASCADE'))

    # ── 4. Drop legacy sequences if they exist ────────────────────────────────
    legacy_sequences = (
        "assignment_id_seq",
        "assignmenttask_id_seq",
        "assignmentusersubmission_id_seq",
        "assignmenttasksubmission_id_seq",
        "assignment_task_id_seq",
        "quiz_attempt_id_seq",
        "exam_attempt_id_seq",
        "code_submission_id_seq",
        "question_id_seq",
    )
    for seq_name in legacy_sequences:
        op.execute(sa.text(f"DROP SEQUENCE IF EXISTS {seq_name} CASCADE"))


def downgrade() -> None:
    # Re-add the breakdown column (populated from effective_breakdown)
    op.add_column(
        "grading_entry",
        sa.Column(
            "breakdown",
            sa.JSON(),
            server_default=sa.text("'{}'::json"),
            nullable=False,
        ),
    )
    op.execute(
        sa.text(
            """
            UPDATE grading_entry
            SET breakdown = COALESCE(effective_breakdown, '{}'::json)
            """
        )
    )
