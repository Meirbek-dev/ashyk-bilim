"""Backfill canonical items and submissions, then drop legacy child tables.

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2026-05-03
"""

from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision: str = "o0p1q2r3s4t5"
down_revision: str | None = "n9o0p1q2r3s4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


assessment_table = sa.table(
    "assessment",
    sa.column("id", sa.Integer()),
    sa.column("activity_id", sa.BigInteger()),
    sa.column("kind", sa.String()),
    sa.column("policy_id", sa.Integer()),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)

assessment_item_table = sa.table(
    "assessment_item",
    sa.column("item_uuid", sa.String()),
    sa.column("assessment_id", sa.Integer()),
    sa.column("order", sa.Integer()),
    sa.column("kind", sa.String()),
    sa.column("title", sa.String()),
    sa.column("body_json", sa.JSON()),
    sa.column("max_score", sa.Float()),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)

submission_table = sa.table(
    "submission",
    sa.column("submission_uuid", sa.String()),
    sa.column("assessment_type", sa.String()),
    sa.column("activity_id", sa.BigInteger()),
    sa.column("assessment_policy_id", sa.Integer()),
    sa.column("user_id", sa.Integer()),
    sa.column("auto_score", sa.Float()),
    sa.column("final_score", sa.Float()),
    sa.column("status", sa.String()),
    sa.column("attempt_number", sa.Integer()),
    sa.column("is_late", sa.Boolean()),
    sa.column("late_penalty_pct", sa.Float()),
    sa.column("answers_json", sa.JSON()),
    sa.column("grading_json", sa.JSON()),
    sa.column("metadata_json", sa.JSON()),
    sa.column("started_at", sa.DateTime(timezone=True)),
    sa.column("submitted_at", sa.DateTime(timezone=True)),
    sa.column("graded_at", sa.DateTime(timezone=True)),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)

assignment_table = sa.table(
    "assignment",
    sa.column("id", sa.Integer()),
    sa.column("activity_id", sa.BigInteger()),
)

assignment_task_table = sa.table(
    "assignment_task",
    sa.column("id", sa.Integer()),
    sa.column("assignment_task_uuid", sa.String()),
    sa.column("assignment_id", sa.Integer()),
    sa.column("order", sa.Integer()),
    sa.column("assignment_type", sa.String()),
    sa.column("title", sa.String()),
    sa.column("description", sa.Text()),
    sa.column("hint", sa.Text()),
    sa.column("reference_file", sa.Text()),
    sa.column("contents", sa.JSON()),
    sa.column("max_grade_value", sa.Integer()),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)

exam_table = sa.table(
    "exam",
    sa.column("id", sa.Integer()),
    sa.column("activity_id", sa.BigInteger()),
)

question_table = sa.table(
    "question",
    sa.column("id", sa.Integer()),
    sa.column("question_uuid", sa.String()),
    sa.column("exam_id", sa.Integer()),
    sa.column("order_index", sa.Integer()),
    sa.column("question_type", sa.String()),
    sa.column("question_text", sa.Text()),
    sa.column("answer_options", sa.JSON()),
    sa.column("explanation", sa.Text()),
    sa.column("points", sa.Integer()),
    sa.column("creation_date", sa.String()),
    sa.column("update_date", sa.String()),
)

exam_attempt_table = sa.table(
    "exam_attempt",
    sa.column("id", sa.Integer()),
    sa.column("attempt_uuid", sa.String()),
    sa.column("exam_id", sa.Integer()),
    sa.column("user_id", sa.Integer()),
    sa.column("status", sa.String()),
    sa.column("score", sa.Integer()),
    sa.column("answers", sa.JSON()),
    sa.column("violations", sa.JSON()),
    sa.column("started_at", sa.String()),
    sa.column("submitted_at", sa.String()),
    sa.column("creation_date", sa.String()),
    sa.column("update_date", sa.String()),
)

code_submission_table = sa.table(
    "code_submission",
    sa.column("id", sa.Integer()),
    sa.column("submission_uuid", sa.String()),
    sa.column("activity_id", sa.BigInteger()),
    sa.column("user_id", sa.BigInteger()),
    sa.column("language_id", sa.Integer()),
    sa.column("language_name", sa.String()),
    sa.column("status", sa.String()),
    sa.column("score", sa.Float()),
    sa.column("passed_tests", sa.Integer()),
    sa.column("total_tests", sa.Integer()),
    sa.column("execution_time_ms", sa.Float()),
    sa.column("memory_kb", sa.Float()),
    sa.column("test_results", sa.JSON()),
    sa.column("plagiarism_score", sa.Float()),
    sa.column("created_at", sa.String()),
    sa.column("updated_at", sa.String()),
)


def _coerce_datetime(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return None


def _as_dict(value: object) -> dict[str, object]:
    return value if isinstance(value, dict) else {}


def _as_list(value: object) -> list[object]:
    return value if isinstance(value, list) else []


def _assignment_item_kind(task_type: str | None) -> str:
    if task_type == "FILE_SUBMISSION":
        return "ASSIGNMENT_FILE"
    if task_type == "QUIZ":
        return "ASSIGNMENT_QUIZ"
    if task_type == "FORM":
        return "ASSIGNMENT_FORM"
    return "ASSIGNMENT_OTHER"


def _assignment_item_body(row: sa.Row) -> dict[str, object]:
    contents = _as_dict(row.contents)
    task_type = row.assignment_type or "OTHER"
    if task_type == "FILE_SUBMISSION":
        allowed = contents.get("allowed_mime_types")
        return {
            "kind": "ASSIGNMENT_FILE",
            "description": row.description or "",
            "hint": row.hint or "",
            "reference_file": row.reference_file,
            "allowed_mime_types": [
                item for item in _as_list(allowed) if isinstance(item, str)
            ],
            "max_file_size_mb": contents.get("max_file_size_mb")
            if isinstance(contents.get("max_file_size_mb"), int)
            else None,
            "max_files": contents.get("max_files")
            if isinstance(contents.get("max_files"), int)
            else 1,
        }
    if task_type == "QUIZ":
        questions: list[dict[str, object]] = []
        for question in _as_list(contents.get("questions")):
            if not isinstance(question, dict):
                continue
            options = []
            for option in _as_list(question.get("options")):
                if not isinstance(option, dict):
                    continue
                options.append({
                    "optionUUID": str(option.get("optionUUID", "")),
                    "text": str(option.get("text", "")),
                    "fileID": str(option.get("fileID", "")),
                    "type": str(option.get("type", "text")),
                    "assigned_right_answer": option.get("assigned_right_answer")
                    is True,
                })
            questions.append({
                "questionUUID": str(question.get("questionUUID", "")),
                "questionText": str(question.get("questionText", "")),
                "options": options,
            })
        return {
            "kind": "ASSIGNMENT_QUIZ",
            "description": row.description or "",
            "hint": row.hint or "",
            "questions": questions,
            "settings": _as_dict(contents.get("settings")),
        }
    if task_type == "FORM":
        questions = []
        for question in _as_list(contents.get("questions")):
            if not isinstance(question, dict):
                continue
            blanks = []
            for blank in _as_list(question.get("blanks")):
                if not isinstance(blank, dict):
                    continue
                blanks.append({
                    "blankUUID": str(blank.get("blankUUID", "")),
                    "placeholder": str(blank.get("placeholder", "")),
                    "correctAnswer": str(blank.get("correctAnswer", "")),
                    "hint": str(blank.get("hint", "")),
                })
            questions.append({
                "questionUUID": str(question.get("questionUUID", "")),
                "questionText": str(question.get("questionText", "")),
                "blanks": blanks,
            })
        return {
            "kind": "ASSIGNMENT_FORM",
            "description": row.description or "",
            "hint": row.hint or "",
            "questions": questions,
        }
    return {
        "kind": "ASSIGNMENT_OTHER",
        "description": row.description or "",
        "hint": row.hint or "",
        "body": contents.get("body")
        if isinstance(contents.get("body"), dict)
        else contents,
    }


def _question_item_kind(question_type: str | None) -> str:
    return "MATCHING" if question_type == "MATCHING" else "CHOICE"


def _question_item_body(row: sa.Row) -> dict[str, object]:
    answer_options = [
        option for option in _as_list(row.answer_options) if isinstance(option, dict)
    ]
    if row.question_type == "MATCHING":
        return {
            "kind": "MATCHING",
            "prompt": row.question_text or "",
            "pairs": [
                {
                    "left": str(option.get("left", "")),
                    "right": str(option.get("right", "")),
                }
                for option in answer_options
            ],
            "explanation": row.explanation,
        }

    multiple = row.question_type == "MULTIPLE_CHOICE"
    variant = (
        "TRUE_FALSE"
        if row.question_type == "TRUE_FALSE"
        else "MULTIPLE_CHOICE"
        if multiple
        else "SINGLE_CHOICE"
    )
    return {
        "kind": "CHOICE",
        "prompt": row.question_text or "",
        "options": [
            {
                "id": str(index),
                "text": str(option.get("text", "")),
                "is_correct": option.get("is_correct") is True,
            }
            for index, option in enumerate(answer_options)
        ],
        "multiple": multiple,
        "variant": variant,
        "explanation": row.explanation,
    }


def _build_code_submission_metadata(
    row: sa.Row, updated_at: datetime
) -> dict[str, object]:
    test_results = _as_dict(row.test_results)
    raw_results = [
        item for item in _as_list(test_results.get("results")) if isinstance(item, dict)
    ]
    latest_run = {
        "run_id": row.submission_uuid,
        "language_id": int(row.language_id or 0),
        "status": str(row.status or ""),
        "passed": int(row.passed_tests or 0),
        "total": int(row.total_tests or 0),
        "score": float(row.score or 0.0),
        "stdout": None,
        "stderr": None,
        "time": (float(row.execution_time_ms) / 1000.0)
        if row.execution_time_ms is not None
        else None,
        "memory": int(row.memory_kb) if row.memory_kb is not None else None,
        "details": raw_results,
        "created_at": updated_at.isoformat(),
    }
    metadata: dict[str, object] = {
        "legacy_code_submission_id": row.id,
        "latest_run": latest_run,
        "runs": [latest_run],
    }
    if row.plagiarism_score is not None:
        metadata["legacy_plagiarism_score"] = float(row.plagiarism_score)
    return metadata


def _table_exists(bind: sa.Connection, table_name: str) -> bool:
    result = bind.execute(
        sa.text(
            "SELECT EXISTS ("
            " SELECT 1 FROM information_schema.tables"
            " WHERE table_schema = 'public' AND table_name = :name"
            ")"
        ),
        {"name": table_name},
    ).scalar()
    return bool(result)


def upgrade() -> None:
    bind = op.get_bind()
    now = datetime.now(UTC)

    assessments = {
        (str(row.kind), int(row.activity_id)): {
            "id": int(row.id),
            "policy_id": row.policy_id,
        }
        for row in bind.execute(
            sa.select(
                assessment_table.c.id,
                assessment_table.c.activity_id,
                assessment_table.c.kind,
                assessment_table.c.policy_id,
            )
        )
    }
    existing_item_uuids = set(
        bind.execute(sa.select(assessment_item_table.c.item_uuid)).scalars()
    )

    items_to_insert: list[dict[str, object]] = []
    touched_assessment_ids: set[int] = set()

    if _table_exists(bind, "assignment_task"):
        assignment_rows = bind.execute(
            sa
            .select(
                assignment_task_table.c.assignment_task_uuid,
                assignment_task_table.c.order,
                assignment_task_table.c.assignment_type,
                assignment_task_table.c.title,
                assignment_task_table.c.description,
                assignment_task_table.c.hint,
                assignment_task_table.c.reference_file,
                assignment_task_table.c.contents,
                assignment_task_table.c.max_grade_value,
                assignment_task_table.c.created_at,
                assignment_task_table.c.updated_at,
                assignment_table.c.activity_id,
            )
            .select_from(
                assignment_task_table.join(
                    assignment_table,
                    assignment_task_table.c.assignment_id == assignment_table.c.id,
                )
            )
            .order_by(
                assignment_table.c.activity_id,
                assignment_task_table.c.order,
                assignment_task_table.c.id,
            )
        ).all()
        for row in assignment_rows:
            if not row.assignment_task_uuid:
                raise RuntimeError("Assignment task row is missing assignment_task_uuid")
            assessment = assessments.get(("ASSIGNMENT", int(row.activity_id)))
            if assessment is None:
                msg = f"Missing canonical assessment for assignment activity {row.activity_id}"
                raise RuntimeError(msg)
            if row.assignment_task_uuid in existing_item_uuids:
                continue
            created_at = _coerce_datetime(row.created_at) or now
            updated_at = _coerce_datetime(row.updated_at) or created_at
            items_to_insert.append({
                "item_uuid": row.assignment_task_uuid,
                "assessment_id": assessment["id"],
                "order": int(row.order or 0),
                "kind": _assignment_item_kind(row.assignment_type),
                "title": row.title or "",
                "body_json": _assignment_item_body(row),
                "max_score": float(row.max_grade_value or 0),
                "created_at": created_at,
                "updated_at": updated_at,
            })
            existing_item_uuids.add(row.assignment_task_uuid)
            touched_assessment_ids.add(int(assessment["id"]))

    if _table_exists(bind, "question"):
        question_rows = bind.execute(
            sa
            .select(
                question_table.c.question_uuid,
                question_table.c.order_index,
                question_table.c.question_type,
                question_table.c.question_text,
                question_table.c.answer_options,
                question_table.c.explanation,
                question_table.c.points,
                question_table.c.creation_date,
                question_table.c.update_date,
                exam_table.c.activity_id,
            )
            .select_from(
                question_table.join(exam_table, question_table.c.exam_id == exam_table.c.id)
            )
            .order_by(
                exam_table.c.activity_id, question_table.c.order_index, question_table.c.id
            )
        ).all()
        for row in question_rows:
            if not row.question_uuid:
                raise RuntimeError("Question row is missing question_uuid")
            assessment = assessments.get(("EXAM", int(row.activity_id)))
            if assessment is None:
                msg = f"Missing canonical assessment for exam activity {row.activity_id}"
                raise RuntimeError(msg)
            if row.question_uuid in existing_item_uuids:
                continue
            created_at = _coerce_datetime(row.creation_date) or now
            updated_at = _coerce_datetime(row.update_date) or created_at
            items_to_insert.append({
                "item_uuid": row.question_uuid,
                "assessment_id": assessment["id"],
                "order": int(row.order_index or 0),
                "kind": _question_item_kind(row.question_type),
                "title": row.question_text or "",
                "body_json": _question_item_body(row),
                "max_score": float(row.points or 0),
                "created_at": created_at,
                "updated_at": updated_at,
            })
            existing_item_uuids.add(row.question_uuid)
            touched_assessment_ids.add(int(assessment["id"]))

    if items_to_insert:
        bind.execute(sa.insert(assessment_item_table), items_to_insert)
        bind.execute(
            sa
            .update(assessment_table)
            .where(assessment_table.c.id.in_(touched_assessment_ids))
            .values(updated_at=now)
        )

    existing_submission_uuids = set(
        bind.execute(sa.select(submission_table.c.submission_uuid)).scalars()
    )
    submissions_to_insert: list[dict[str, object]] = []

    if _table_exists(bind, "exam_attempt"):
        exam_attempt_rows = bind.execute(
            sa
            .select(
                exam_attempt_table.c.id,
                exam_attempt_table.c.attempt_uuid,
                exam_attempt_table.c.user_id,
                exam_attempt_table.c.status,
                exam_attempt_table.c.score,
                exam_attempt_table.c.answers,
                exam_attempt_table.c.violations,
                exam_attempt_table.c.started_at,
                exam_attempt_table.c.submitted_at,
                exam_attempt_table.c.creation_date,
                exam_attempt_table.c.update_date,
                exam_table.c.activity_id,
            )
            .select_from(
                exam_attempt_table.join(
                    exam_table, exam_attempt_table.c.exam_id == exam_table.c.id
                )
            )
            .order_by(
                exam_table.c.activity_id,
                exam_attempt_table.c.user_id,
                exam_attempt_table.c.creation_date,
                exam_attempt_table.c.id,
            )
        ).all()
        exam_attempt_numbers: defaultdict[tuple[int, int], int] = defaultdict(int)
        for row in exam_attempt_rows:
            if not row.attempt_uuid:
                raise RuntimeError("Exam attempt row is missing attempt_uuid")
            key = (int(row.activity_id), int(row.user_id))
            exam_attempt_numbers[key] += 1
            submission_uuid = f"submission_{row.attempt_uuid}"
            if submission_uuid in existing_submission_uuids:
                continue
            assessment = assessments.get(("EXAM", int(row.activity_id)))
            if assessment is None:
                msg = f"Missing canonical assessment for exam activity {row.activity_id}"
                raise RuntimeError(msg)
            status_value = str(row.status or "")
            canonical_status = (
                "GRADED" if status_value in {"SUBMITTED", "AUTO_SUBMITTED"} else "DRAFT"
            )
            created_at = (
                _coerce_datetime(row.creation_date)
                or _coerce_datetime(row.started_at)
                or now
            )
            updated_at = (
                _coerce_datetime(row.update_date)
                or _coerce_datetime(row.submitted_at)
                or created_at
            )
            submitted_at = _coerce_datetime(row.submitted_at)
            metadata: dict[str, object] = {
                "exam_attempt_id": row.id,
                "attempt_uuid": row.attempt_uuid,
            }
            if isinstance(row.violations, list) and row.violations:
                metadata["violations"] = row.violations
            submissions_to_insert.append({
                "submission_uuid": submission_uuid,
                "assessment_type": "EXAM",
                "activity_id": int(row.activity_id),
                "assessment_policy_id": assessment["policy_id"],
                "user_id": int(row.user_id),
                "auto_score": float(row.score or 0),
                "final_score": float(row.score)
                if row.score is not None and canonical_status == "GRADED"
                else None,
                "status": canonical_status,
                "attempt_number": exam_attempt_numbers[key],
                "is_late": False,
                "late_penalty_pct": 0.0,
                "answers_json": _as_dict(row.answers),
                "grading_json": {},
                "metadata_json": metadata,
                "started_at": _coerce_datetime(row.started_at),
                "submitted_at": submitted_at,
                "graded_at": submitted_at if canonical_status == "GRADED" else None,
                "created_at": created_at,
                "updated_at": updated_at,
            })
            existing_submission_uuids.add(submission_uuid)

    if _table_exists(bind, "code_submission"):
        code_submission_rows = bind.execute(
            sa.select(
                code_submission_table.c.id,
                code_submission_table.c.submission_uuid,
                code_submission_table.c.activity_id,
                code_submission_table.c.user_id,
                code_submission_table.c.language_id,
                code_submission_table.c.language_name,
                code_submission_table.c.status,
                code_submission_table.c.score,
                code_submission_table.c.passed_tests,
                code_submission_table.c.total_tests,
                code_submission_table.c.execution_time_ms,
                code_submission_table.c.memory_kb,
                code_submission_table.c.test_results,
                code_submission_table.c.plagiarism_score,
                code_submission_table.c.created_at,
                code_submission_table.c.updated_at,
            ).order_by(
                code_submission_table.c.activity_id,
                code_submission_table.c.user_id,
                code_submission_table.c.created_at,
                code_submission_table.c.id,
            )
        ).all()
        code_attempt_numbers: defaultdict[tuple[int, int], int] = defaultdict(int)
        for row in code_submission_rows:
            if not row.submission_uuid:
                raise RuntimeError("Code submission row is missing submission_uuid")
            key = (int(row.activity_id), int(row.user_id))
            code_attempt_numbers[key] += 1
            if row.submission_uuid in existing_submission_uuids:
                continue
            assessment = assessments.get(("CODE_CHALLENGE", int(row.activity_id)))
            if assessment is None:
                msg = f"Missing canonical assessment for code challenge activity {row.activity_id}"
                raise RuntimeError(msg)
            status_value = str(row.status or "")
            canonical_status = (
                "PENDING"
                if status_value in {"PENDING", "PROCESSING", "PENDING_JUDGE0"}
                else "GRADED"
            )
            created_at = _coerce_datetime(row.created_at) or now
            updated_at = _coerce_datetime(row.updated_at) or created_at
            submitted_at = updated_at if canonical_status != "PENDING" else None
            submissions_to_insert.append({
                "submission_uuid": row.submission_uuid,
                "assessment_type": "CODE_CHALLENGE",
                "activity_id": int(row.activity_id),
                "assessment_policy_id": assessment["policy_id"],
                "user_id": int(row.user_id),
                "auto_score": float(row.score or 0),
                "final_score": float(row.score)
                if row.score is not None and canonical_status == "GRADED"
                else None,
                "status": canonical_status,
                "attempt_number": code_attempt_numbers[key],
                "is_late": False,
                "late_penalty_pct": 0.0,
                "answers_json": {
                    "language_id": int(row.language_id or 0),
                    "language_name": row.language_name or "",
                },
                "grading_json": {},
                "metadata_json": _build_code_submission_metadata(row, updated_at),
                "started_at": created_at,
                "submitted_at": submitted_at,
                "graded_at": updated_at if canonical_status == "GRADED" else None,
                "created_at": created_at,
                "updated_at": updated_at,
            })
            existing_submission_uuids.add(row.submission_uuid)

    if submissions_to_insert:
        bind.execute(sa.insert(submission_table), submissions_to_insert)

    for table_name in ("code_submission", "exam_attempt", "question", "assignment_task"):
        if _table_exists(bind, table_name):
            op.drop_table(table_name)


def downgrade() -> None:
    op.create_table(
        "assignment_task",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("assignment_task_uuid", sa.String(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("hint", sa.Text(), nullable=False),
        sa.Column("reference_file", sa.Text(), nullable=True),
        sa.Column("assignment_type", sa.String(), nullable=False),
        sa.Column("max_grade_value", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("contents", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "assignment_id",
            sa.Integer(),
            sa.ForeignKey("assignment.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "course_id",
            sa.BigInteger(),
            sa.ForeignKey("course.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chapter_id",
            sa.BigInteger(),
            sa.ForeignKey("chapter.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "activity_id",
            sa.BigInteger(),
            sa.ForeignKey("activity.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("assignment_id", "order", name="uq_assignmenttask_order"),
        sa.UniqueConstraint(
            "assignment_id",
            "assignment_task_uuid",
            name="uq_assignmenttask_assignment_uuid",
        ),
    )
    op.create_index(
        "idx_assignmenttask_assignment_order",
        "assignment_task",
        ["assignment_id", "order"],
        unique=False,
    )
    op.create_index(
        "idx_assignmenttask_activity_id",
        "assignment_task",
        ["activity_id"],
        unique=False,
    )

    op.create_table(
        "question",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("question_uuid", sa.String(), nullable=False, server_default=""),
        sa.Column(
            "exam_id",
            sa.Integer(),
            sa.ForeignKey("exam.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("question_type", sa.String(), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("answer_options", sa.JSON(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )

    op.create_table(
        "exam_attempt",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("attempt_uuid", sa.String(), nullable=False, server_default=""),
        sa.Column(
            "exam_id",
            sa.Integer(),
            sa.ForeignKey("exam.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("max_score", sa.Integer(), nullable=True),
        sa.Column("answers", sa.JSON(), nullable=True),
        sa.Column("question_order", sa.JSON(), nullable=True),
        sa.Column("violations", sa.JSON(), nullable=True),
        sa.Column(
            "is_preview", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("started_at", sa.String(), nullable=True),
        sa.Column("submitted_at", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index(
        "idx_exam_attempt_exam_user",
        "exam_attempt",
        ["exam_id", "user_id"],
        unique=False,
    )

    op.create_table(
        "code_submission",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_uuid", sa.String(), nullable=False),
        sa.Column(
            "activity_id",
            sa.BigInteger(),
            sa.ForeignKey("activity.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("language_id", sa.Integer(), nullable=False),
        sa.Column("language_name", sa.String(), nullable=False, server_default=""),
        sa.Column("source_code", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("passed_tests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("execution_time_ms", sa.Float(), nullable=True),
        sa.Column("memory_kb", sa.Float(), nullable=True),
        sa.Column("test_results", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.String(), nullable=False, server_default=""),
        sa.Column("plagiarism_score", sa.Float(), nullable=True),
        sa.Column("judge0_tokens", sa.JSON(), nullable=True),
    )
    op.create_index(
        "idx_code_submission_user_activity",
        "code_submission",
        ["user_id", "activity_id"],
        unique=False,
    )
    op.create_index(
        "idx_code_submission_score",
        "code_submission",
        ["activity_id", "score"],
        unique=False,
    )
    op.create_index(
        "idx_code_submission_created",
        "code_submission",
        ["created_at"],
        unique=False,
    )
