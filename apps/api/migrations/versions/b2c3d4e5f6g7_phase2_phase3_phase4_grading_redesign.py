"""Phase 2 + Phase 3 + Phase 4: Submission state-machine, grade release mode,
   StudentPolicyOverride, weighted scoring.

Changes
-------
assessment_policy table
  - ADD COLUMN grade_release_mode  VARCHAR NOT NULL DEFAULT 'IMMEDIATE'

assignment table
  - ADD COLUMN weight              FLOAT   NOT NULL DEFAULT 1.0

course_progress table
  - ADD COLUMN weighted_grade_average  FLOAT

student_policy_override table  (new)
  CREATE TABLE student_policy_override (
      id                   SERIAL PRIMARY KEY,
      policy_id            INTEGER NOT NULL REFERENCES assessment_policy(id) ON DELETE CASCADE,
      user_id              INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      max_attempts_override INTEGER,
      due_at_override      TIMESTAMPTZ,
      waive_late_penalty   BOOLEAN NOT NULL DEFAULT false,
      note                 TEXT    NOT NULL DEFAULT '',
      expires_at           TIMESTAMPTZ,
      granted_by           INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
      created_at           TIMESTAMPTZ NOT NULL,
      updated_at           TIMESTAMPTZ NOT NULL,
      UNIQUE (policy_id, user_id)
  );
  CREATE INDEX ix_spo_policy_user ON student_policy_override(policy_id, user_id);
  CREATE INDEX ix_spo_user_id     ON student_policy_override(user_id);

Revision ID: b2c3d4e5f6g7
Revises: a2b3c4d5e6f7
Create Date: 2026-04-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6g7"
down_revision: str | None = "a2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── assessment_policy: grade_release_mode ────────────────────────────────
    op.add_column(
        "assessment_policy",
        sa.Column(
            "grade_release_mode",
            sa.String(),
            nullable=False,
            server_default="IMMEDIATE",
        ),
    )

    # ── assignment: weight ────────────────────────────────────────────────────
    op.add_column(
        "assignment",
        sa.Column(
            "weight",
            sa.Float(),
            nullable=False,
            server_default="1.0",
        ),
    )

    # ── course_progress: weighted_grade_average ───────────────────────────────
    op.add_column(
        "course_progress",
        sa.Column(
            "weighted_grade_average",
            sa.Float(),
            nullable=True,
        ),
    )

    # ── student_policy_override (new table) ───────────────────────────────────
    op.create_table(
        "student_policy_override",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column("policy_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("max_attempts_override", sa.Integer(), nullable=True),
        sa.Column("due_at_override", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "waive_late_penalty",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "granted_by",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["policy_id"],
            ["assessment_policy.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "policy_id",
            "user_id",
            name="uq_student_policy_override_policy_user",
        ),
    )
    op.create_index(
        "ix_spo_policy_user",
        "student_policy_override",
        ["policy_id", "user_id"],
        unique=False,
    )
    op.create_index(
        "ix_spo_user_id",
        "student_policy_override",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    # Drop student_policy_override
    op.drop_index("ix_spo_user_id", table_name="student_policy_override")
    op.drop_index("ix_spo_policy_user", table_name="student_policy_override")
    op.drop_table("student_policy_override")

    # Drop course_progress.weighted_grade_average
    op.drop_column("course_progress", "weighted_grade_average")

    # Drop assignment.weight
    op.drop_column("assignment", "weight")

    # Drop assessment_policy.grade_release_mode
    op.drop_column("assessment_policy", "grade_release_mode")
