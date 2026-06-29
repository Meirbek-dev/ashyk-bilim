"""AI adaptive learning features.

Revision ID: 2026_06_28_ai_adaptive_learning
Revises: d60d3d2c88f1
Create Date: 2026-06-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2026_06_28_ai_adaptive_learning"
down_revision: str | None = "d60d3d2c88f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_thread",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("thread_uuid", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("activity_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("retention_class", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["activity_id"], ["activity.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_thread_uuid", "ai_thread", ["thread_uuid"], unique=True)
    op.create_index("idx_ai_thread_user_role", "ai_thread", ["user_id", "role", "updated_at"])
    op.create_index("idx_ai_thread_course_activity", "ai_thread", ["course_id", "activity_id", "updated_at"])

    op.create_table(
        "ai_run",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_uuid", sa.String(), nullable=False),
        sa.Column("thread_id", sa.Integer(), nullable=False),
        sa.Column("model_name", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("cost_estimate", sa.Numeric(12, 6), nullable=True),
        sa.Column("safety_state", sa.String(), nullable=True),
        sa.Column("error_code", sa.String(), nullable=True),
        sa.Column("run_metadata", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["thread_id"], ["ai_thread.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_run_uuid", "ai_run", ["run_uuid"], unique=True)
    op.create_index("idx_ai_run_thread_status", "ai_run", ["thread_id", "status", "started_at"])

    op.create_table(
        "ai_event",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("payload_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["ai_run.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_event_run_sequence", "ai_event", ["run_id", "sequence"], unique=True)
    op.create_index("idx_ai_event_event_id", "ai_event", ["event_id"], unique=True)

    op.create_table(
        "ai_artifact",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("artifact_uuid", sa.String(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("content_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("final", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["ai_run.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_artifact_uuid", "ai_artifact", ["artifact_uuid"], unique=True)
    op.create_index("idx_ai_artifact_run_kind", "ai_artifact", ["run_id", "kind", "created_at"])

    op.create_table(
        "ai_evidence",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("artifact_id", sa.Integer(), nullable=True),
        sa.Column("citation_id", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=False),
        sa.Column("excerpt", sa.String(), nullable=False),
        sa.Column("score", sa.Numeric(6, 4), nullable=True),
        sa.Column("evidence_metadata", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["artifact_id"], ["ai_artifact.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["run_id"], ["ai_run.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_evidence_run", "ai_evidence", ["run_id", "source_type", "created_at"])

    op.create_table(
        "ai_approval",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("approval_uuid", sa.String(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("action_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), nullable=True),
        sa.Column("resolved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("payload_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resolved_by_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["run_id"], ["ai_run.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_approval_uuid", "ai_approval", ["approval_uuid"], unique=True)
    op.create_index("idx_ai_approval_status", "ai_approval", ["status", "expires_at"])

    op.create_table(
        "ai_eval_result",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("eval_uuid", sa.String(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("dataset", sa.String(), nullable=False),
        sa.Column("evaluator", sa.String(), nullable=False),
        sa.Column("score", sa.Numeric(6, 4), nullable=True),
        sa.Column("passed", sa.Boolean(), nullable=True),
        sa.Column("details_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["ai_run.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_eval_uuid", "ai_eval_result", ["eval_uuid"], unique=True)
    op.create_index("idx_ai_eval_dataset", "ai_eval_result", ["dataset", "created_at"])

    op.create_table(
        "ai_course_analysis",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("analysis_uuid", sa.String(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("triggered_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("language", sa.String(), nullable=False),
        sa.Column("public_score", sa.Integer(), nullable=False),
        sa.Column("report_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("evidence_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("model_name", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["ai_run.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["triggered_by_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_course_analysis_uuid", "ai_course_analysis", ["analysis_uuid"], unique=True)
    op.create_index("idx_ai_course_analysis_course_status", "ai_course_analysis", ["course_id", "status", "created_at"])

    op.create_table(
        "ai_submission_analysis",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("analysis_uuid", sa.String(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("triggered_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("language", sa.String(), nullable=False),
        sa.Column("gap_count", sa.Integer(), nullable=False),
        sa.Column("analysis_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("evidence_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("model_name", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["ai_run.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["submission_id"], ["submission.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["triggered_by_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_submission_analysis_uuid", "ai_submission_analysis", ["analysis_uuid"], unique=True)
    op.create_index("idx_ai_submission_analysis_submission", "ai_submission_analysis", ["submission_id", "status", "created_at"])

    op.create_table(
        "ai_remediation_session",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_uuid", sa.String(), nullable=False),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("analysis_id", sa.Integer(), nullable=True),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("gate_mode", sa.Boolean(), nullable=False),
        sa.Column("language", sa.String(), nullable=False),
        sa.Column("lecture_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("test_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("passed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["activity_id"], ["activity.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["analysis_id"], ["ai_submission_analysis.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["run_id"], ["ai_run.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submission_id"], ["submission.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_remediation_uuid", "ai_remediation_session", ["session_uuid"], unique=True)
    op.create_index("idx_ai_remediation_student_activity", "ai_remediation_session", ["student_user_id", "activity_id", "status"])
    op.create_index("idx_ai_remediation_submission", "ai_remediation_session", ["submission_id", "created_at"])

    op.create_table(
        "ai_lecture_review",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("review_uuid", sa.String(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.Integer(), nullable=True),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("triggered_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("language", sa.String(), nullable=False),
        sa.Column("suggestions_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("dismissed_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["activity_id"], ["activity.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["ai_run.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["triggered_by_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_lecture_review_uuid", "ai_lecture_review", ["review_uuid"], unique=True)
    op.create_index("idx_ai_lecture_review_activity_status", "ai_lecture_review", ["activity_id", "status", "created_at"])

    op.create_table(
        "ai_qa_message",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_uuid", sa.String(), nullable=False),
        sa.Column("thread_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("confidence", sa.String(), nullable=True),
        sa.Column("citations_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("message_metadata", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["thread_id"], ["ai_thread.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_qa_message_uuid", "ai_qa_message", ["message_uuid"], unique=True)
    op.create_index("idx_ai_qa_thread_order", "ai_qa_message", ["thread_id", "created_at"])
    op.create_index("idx_ai_qa_course_user", "ai_qa_message", ["course_id", "user_id", "created_at"])

    op.create_table(
        "ai_student_memory",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_user_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.String(), nullable=False),
        sa.Column("source_id", sa.String(), nullable=False),
        sa.Column("memory_text", sa.String(), nullable=False),
        sa.Column("language", sa.String(), nullable=False),
        sa.Column("memory_metadata", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["course.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_ai_student_memory_student_course", "ai_student_memory", ["student_user_id", "course_id", "updated_at"])
    op.create_index("idx_ai_student_memory_source", "ai_student_memory", ["source_type", "source_id"])


def downgrade() -> None:
    op.drop_index("idx_ai_student_memory_source", table_name="ai_student_memory")
    op.drop_index("idx_ai_student_memory_student_course", table_name="ai_student_memory")
    op.drop_table("ai_student_memory")
    op.drop_index("idx_ai_qa_course_user", table_name="ai_qa_message")
    op.drop_index("idx_ai_qa_thread_order", table_name="ai_qa_message")
    op.drop_index("idx_ai_qa_message_uuid", table_name="ai_qa_message")
    op.drop_table("ai_qa_message")
    op.drop_index("idx_ai_lecture_review_activity_status", table_name="ai_lecture_review")
    op.drop_index("idx_ai_lecture_review_uuid", table_name="ai_lecture_review")
    op.drop_table("ai_lecture_review")
    op.drop_index("idx_ai_remediation_submission", table_name="ai_remediation_session")
    op.drop_index("idx_ai_remediation_student_activity", table_name="ai_remediation_session")
    op.drop_index("idx_ai_remediation_uuid", table_name="ai_remediation_session")
    op.drop_table("ai_remediation_session")
    op.drop_index("idx_ai_submission_analysis_submission", table_name="ai_submission_analysis")
    op.drop_index("idx_ai_submission_analysis_uuid", table_name="ai_submission_analysis")
    op.drop_table("ai_submission_analysis")
    op.drop_index("idx_ai_course_analysis_course_status", table_name="ai_course_analysis")
    op.drop_index("idx_ai_course_analysis_uuid", table_name="ai_course_analysis")
    op.drop_table("ai_course_analysis")
    op.drop_index("idx_ai_eval_dataset", table_name="ai_eval_result")
    op.drop_index("idx_ai_eval_uuid", table_name="ai_eval_result")
    op.drop_table("ai_eval_result")
    op.drop_index("idx_ai_approval_status", table_name="ai_approval")
    op.drop_index("idx_ai_approval_uuid", table_name="ai_approval")
    op.drop_table("ai_approval")
    op.drop_index("idx_ai_evidence_run", table_name="ai_evidence")
    op.drop_table("ai_evidence")
    op.drop_index("idx_ai_artifact_run_kind", table_name="ai_artifact")
    op.drop_index("idx_ai_artifact_uuid", table_name="ai_artifact")
    op.drop_table("ai_artifact")
    op.drop_index("idx_ai_event_event_id", table_name="ai_event")
    op.drop_index("idx_ai_event_run_sequence", table_name="ai_event")
    op.drop_table("ai_event")
    op.drop_index("idx_ai_run_thread_status", table_name="ai_run")
    op.drop_index("idx_ai_run_uuid", table_name="ai_run")
    op.drop_table("ai_run")
    op.drop_index("idx_ai_thread_course_activity", table_name="ai_thread")
    op.drop_index("idx_ai_thread_user_role", table_name="ai_thread")
    op.drop_index("idx_ai_thread_uuid", table_name="ai_thread")
    op.drop_table("ai_thread")
