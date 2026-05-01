"""Helpers for synthesizing grading breakdown items from assessment items."""

from collections.abc import Sequence
from typing import Any

from sqlmodel import Session, select

from src.db.assessments import Assessment, AssessmentItem
from src.db.grading.submissions import (
    AssessmentType,
    GradedItem,
    GradingBreakdown,
    Submission,
)


def build_effective_grading_breakdown(
    submission: Submission,
    db_session: Session,
) -> GradingBreakdown:
    """Return the persisted breakdown, synthesizing assignment task items when needed."""

    existing = GradingBreakdown.model_validate(submission.grading_json or {})
    if submission.assessment_type != AssessmentType.ASSIGNMENT:
        return existing

    assessment = db_session.exec(
        select(Assessment).where(Assessment.activity_id == submission.activity_id)
    ).first()
    if assessment is None:
        return existing
    assignment_tasks = db_session.exec(
        select(AssessmentItem)
        .where(AssessmentItem.assessment_id == assessment.id)
        .order_by(AssessmentItem.order, AssessmentItem.id)
    ).all()
    return build_assignment_breakdown(
        existing, submission.answers_json, assignment_tasks
    )


def build_assignment_breakdown(
    existing: GradingBreakdown,
    answers_json: object,
    assignment_tasks: Sequence[AssessmentItem],
) -> GradingBreakdown:
    """Merge assignment task metadata, answers, and any existing teacher grading."""

    if not assignment_tasks:
        return existing

    answers_by_task_uuid = _extract_assignment_answers(answers_json)
    existing_items = {item.item_id: item for item in existing.items}
    merged_items: list[GradedItem] = []

    for task in assignment_tasks:
        task_uuid = task.item_uuid
        persisted_item = existing_items.pop(task_uuid, None)
        normalized_answer = _normalize_assignment_answer(
            answers_by_task_uuid.get(task_uuid)
        )
        max_score = float(task.max_score or 0)

        if persisted_item is not None:
            merged_items.append(
                persisted_item.model_copy(
                    update={
                        "item_text": persisted_item.item_text or task.title,
                        "max_score": persisted_item.max_score or max_score,
                        "user_answer": persisted_item.user_answer
                        if persisted_item.user_answer is not None
                        else normalized_answer,
                    }
                )
            )
            continue

        merged_items.append(
            GradedItem(
                item_id=task_uuid,
                item_text=task.title,
                score=0.0,
                max_score=max_score,
                correct=None,
                feedback="",
                needs_manual_review=True,
                user_answer=normalized_answer,
                correct_answer=None,
            )
        )

    merged_items.extend(existing_items.values())

    return GradingBreakdown(
        items=merged_items,
        needs_manual_review=any(
            item.needs_manual_review and not item.feedback for item in merged_items
        ),
        auto_graded=False,
        feedback=existing.feedback,
    )


def _extract_assignment_answers(answers_json: object) -> dict[str, dict[str, Any]]:
    if not isinstance(answers_json, dict):
        return {}

    raw_answers = answers_json.get("answers")
    if isinstance(raw_answers, dict):
        return {
            str(item_uuid): answer
            for item_uuid, answer in raw_answers.items()
            if isinstance(answer, dict)
        }

    raw_tasks = answers_json.get("tasks", [])
    if not isinstance(raw_tasks, list):
        return {}

    answers: dict[str, dict[str, Any]] = {}
    for raw_task in raw_tasks:
        if not isinstance(raw_task, dict):
            continue
        task_uuid = raw_task.get("task_uuid")
        if isinstance(task_uuid, str) and task_uuid:
            answers[task_uuid] = raw_task
    return answers


def _normalize_assignment_answer(
    raw_task_answer: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if raw_task_answer is None:
        return None

    normalized: dict[str, Any] = {}

    content_type = raw_task_answer.get("content_type")
    if isinstance(content_type, str) and content_type:
        normalized["content_type"] = content_type

    if "file_key" in raw_task_answer:
        normalized["file_key"] = raw_task_answer.get("file_key")
    if "text_content" in raw_task_answer:
        normalized["text_content"] = raw_task_answer.get("text_content")

    form_data = raw_task_answer.get("form_data")
    if isinstance(form_data, dict):
        normalized["form_data"] = form_data

    quiz_answers = raw_task_answer.get("quiz_answers")
    if isinstance(quiz_answers, dict):
        normalized["quiz_answers"] = quiz_answers

    answer_metadata = raw_task_answer.get("answer_metadata")
    if isinstance(answer_metadata, dict):
        normalized["answer_metadata"] = answer_metadata

    return normalized or raw_task_answer
