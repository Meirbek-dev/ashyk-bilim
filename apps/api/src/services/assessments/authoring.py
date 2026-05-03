import csv
import io
import json
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlmodel import Session

from src.db.assessment_contracts import (
    QUESTION_LIMIT_MIN,
    TIME_LIMIT_MAX,
    TIME_LIMIT_MIN,
    VIOLATION_THRESHOLD_MAX,
    VIOLATION_THRESHOLD_MIN,
    AssignmentRead,
    AssignmentStatus,
    AssignmentTaskCreate,
    AssignmentTaskRead,
    AssignmentTaskTypeEnum,
    AssignmentTaskUpdate,
    GradingTypeEnum,
    QuestionCreate,
    QuestionRead,
    QuestionTypeEnum,
    QuestionUpdate,
)
from src.db.assessments import (
    AssessmentItemCreate,
    AssessmentItemReorder,
    AssessmentItemReorderEntry,
    AssessmentItemUpdate,
    AssessmentReadItem,
    AssignmentFileItemBody,
    AssignmentFormBlank,
    AssignmentFormItemBody,
    AssignmentFormQuestion,
    AssignmentOtherItemBody,
    AssignmentQuizItemBody,
    AssignmentQuizOption,
    AssignmentQuizQuestion,
    AssignmentQuizSettings,
    ChoiceItemBody,
    ChoiceOption,
    ItemKind,
    MatchingItemBody,
    MatchPair,
)
from src.db.grading.submissions import AssessmentType
from src.db.users import PublicUser
from src.services.assessments.core import (
    _build_item_read,
    _ensure_authorable,
    _get_activity_and_course,
    _get_assessment_by_uuid_or_404,
    _get_item_or_404,
    _get_items_raw,
    _require_author,
    _require_read,
    create_assessment_item,
    delete_assessment_item,
    reorder_assessment_items,
    update_assessment_item,
)


def assessment_to_assignment_read(assessment: dict[str, object]) -> AssignmentRead:
    lifecycle = str(assessment.get("lifecycle", AssignmentStatus.DRAFT.value))
    policy = (
        assessment.get("assessment_policy")
        if isinstance(assessment.get("assessment_policy"), dict)
        else {}
    )
    return AssignmentRead.model_validate({
        "assignment_uuid": assessment.get("assessment_uuid"),
        "title": assessment.get("title", ""),
        "description": assessment.get("description", ""),
        "due_at": policy.get("due_at"),
        "published": lifecycle == AssignmentStatus.PUBLISHED.value,
        "status": lifecycle,
        "scheduled_publish_at": assessment.get("scheduled_at"),
        "published_at": assessment.get("published_at"),
        "archived_at": assessment.get("archived_at"),
        "weight": assessment.get("weight", 1.0),
        "grading_type": assessment.get(
            "grading_type", GradingTypeEnum.PERCENTAGE.value
        ),
        "course_uuid": assessment.get("course_uuid"),
        "activity_uuid": assessment.get("activity_uuid"),
        "created_at": assessment.get("created_at"),
        "updated_at": assessment.get("updated_at"),
    })


async def list_assignment_tasks(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list[AssignmentTaskRead]:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    if assessment.kind != AssessmentType.ASSIGNMENT:
        raise HTTPException(status_code=404, detail="Assignment assessment not found")
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_read(current_user, activity, course, db_session)
    return [
        _assignment_task_from_item(_build_item_read(item))
        for item in _get_items_raw(assessment, db_session)
        if item.kind in _ASSIGNMENT_ITEM_KINDS
    ]


async def get_assignment_task(
    assessment_uuid: str,
    task_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> AssignmentTaskRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    if assessment.kind != AssessmentType.ASSIGNMENT:
        raise HTTPException(status_code=404, detail="Assignment assessment not found")
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_read(current_user, activity, course, db_session)
    item = _get_item_or_404(assessment, task_uuid, db_session)
    return _assignment_task_from_item(_build_item_read(item))


async def create_assignment_task(
    assessment_uuid: str,
    payload: AssignmentTaskCreate,
    current_user: PublicUser,
    db_session: Session,
) -> AssignmentTaskRead:
    item = await create_assessment_item(
        assessment_uuid,
        AssessmentItemCreate(
            kind=_assignment_task_type_to_item_kind(payload.assignment_type),
            title=payload.title,
            body=_assignment_item_body_from_payload(payload),
            max_score=float(payload.max_grade_value),
        ),
        current_user,
        db_session,
    )
    return _assignment_task_from_item(item)


async def update_assignment_task(
    assessment_uuid: str,
    task_uuid: str,
    payload: AssignmentTaskUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> AssignmentTaskRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    if assessment.kind != AssessmentType.ASSIGNMENT:
        raise HTTPException(status_code=404, detail="Assignment assessment not found")
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    _ensure_authorable(assessment)
    item = _get_item_or_404(assessment, task_uuid, db_session)
    next_task = _assignment_task_from_item(_build_item_read(item)).model_copy(
        update=payload.model_dump(exclude_unset=True, exclude_none=True)
    )
    updated = await update_assessment_item(
        assessment_uuid,
        task_uuid,
        AssessmentItemUpdate(
            kind=_assignment_task_type_to_item_kind(next_task.assignment_type),
            title=next_task.title,
            body=_assignment_item_body_from_read(next_task),
            max_score=float(next_task.max_grade_value),
        ),
        current_user,
        db_session,
    )
    return _assignment_task_from_item(updated)


async def delete_assignment_task(
    assessment_uuid: str,
    task_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, str]:
    return await delete_assessment_item(
        assessment_uuid, task_uuid, current_user, db_session
    )


async def list_exam_questions(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> list[QuestionRead]:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    if assessment.kind != AssessmentType.EXAM:
        raise HTTPException(status_code=404, detail="Exam assessment not found")
    activity, course = _get_activity_and_course(assessment, db_session)
    _require_read(current_user, activity, course, db_session)
    return [
        _question_from_item(_build_item_read(item))
        for item in _get_items_raw(assessment, db_session)
        if item.kind in {ItemKind.CHOICE, ItemKind.MATCHING}
    ]


async def create_exam_question(
    assessment_uuid: str,
    payload: QuestionCreate,
    current_user: PublicUser,
    db_session: Session,
) -> QuestionRead:
    _validate_question_payload(
        payload.question_text, payload.question_type, payload.answer_options
    )
    item = await create_assessment_item(
        assessment_uuid,
        AssessmentItemCreate(
            kind=_question_type_to_item_kind(payload.question_type),
            title=payload.question_text,
            body=_question_item_body_from_payload(payload),
            max_score=float(payload.points),
        ),
        current_user,
        db_session,
    )
    return _question_from_item(item)


async def update_exam_question(
    assessment_uuid: str,
    question_uuid: str,
    payload: QuestionUpdate,
    current_user: PublicUser,
    db_session: Session,
) -> QuestionRead:
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    if assessment.kind != AssessmentType.EXAM:
        raise HTTPException(status_code=404, detail="Exam assessment not found")
    _activity, course = _get_activity_and_course(assessment, db_session)
    _require_author(current_user, course, db_session)
    _ensure_authorable(assessment)
    item = _get_item_or_404(assessment, question_uuid, db_session)
    current = _question_from_item(_build_item_read(item)).model_dump()
    update_data = payload.model_dump(exclude_unset=True, exclude_none=True)
    merged = QuestionRead.model_validate({**current, **update_data})
    _validate_question_payload(
        merged.question_text, merged.question_type, merged.answer_options
    )
    updated = await update_assessment_item(
        assessment_uuid,
        question_uuid,
        AssessmentItemUpdate(
            kind=_question_type_to_item_kind(merged.question_type),
            title=merged.question_text,
            body=_question_item_body_from_read(merged),
            max_score=float(merged.points),
        ),
        current_user,
        db_session,
    )
    return _question_from_item(updated)


async def delete_exam_question(
    assessment_uuid: str,
    question_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, str]:
    return await delete_assessment_item(
        assessment_uuid, question_uuid, current_user, db_session
    )


async def reorder_exam_questions(
    assessment_uuid: str,
    question_order: list[dict[str, object]],
    current_user: PublicUser,
    db_session: Session,
) -> list[QuestionRead]:
    reordered = await reorder_assessment_items(
        assessment_uuid,
        AssessmentItemReorder(
            items=[
                AssessmentItemReorderEntry(
                    item_uuid=str(entry.get("question_uuid", "")),
                    order=int(entry.get("order_index", 0)),
                )
                for entry in question_order
            ]
        ),
        current_user,
        db_session,
    )
    return [
        _question_from_item(item)
        for item in reordered
        if item.kind in {ItemKind.CHOICE, ItemKind.MATCHING}
    ]


async def export_exam_questions_csv(
    assessment_uuid: str,
    current_user: PublicUser,
    db_session: Session,
) -> str:
    questions = await list_exam_questions(assessment_uuid, current_user, db_session)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Текст вопроса",
        "Тип",
        "Баллы",
        "Варианты ответов (JSON)",
        "Пояснение",
        "Порядок",
    ])
    for question in questions:
        writer.writerow([
            question.question_text,
            question.question_type,
            question.points,
            json.dumps(question.answer_options),
            question.explanation or "",
            question.order_index,
        ])
    return output.getvalue()


async def import_exam_questions_csv(
    assessment_uuid: str,
    csv_content: str,
    current_user: PublicUser,
    db_session: Session,
) -> dict[str, object]:
    reader = csv.DictReader(io.StringIO(csv_content))
    imported = 0
    errors: list[str] = []
    assessment = _get_assessment_by_uuid_or_404(assessment_uuid, db_session)
    existing = _get_items_raw(assessment, db_session)
    next_order = max((item.order for item in existing), default=-1) + 1

    for row_num, row in enumerate(reader, start=2):
        try:
            question_text = (
                row.get("Question Text", "") or row.get("Текст вопроса", "")
            ).strip()
            question_type = (row.get("Type", "") or row.get("Тип", "")).strip()
            points_raw = row.get("Points", "") or row.get("Баллы", "1")
            answer_options_json = row.get("Answer Options (JSON)", "[]") or row.get(
                "Варианты ответов (JSON)", "[]"
            )
            explanation = (
                row.get("Explanation", "") or row.get("Пояснение", "")
            ).strip() or None
            question_type_enum = QuestionTypeEnum(question_type)
            answer_options = json.loads(answer_options_json)
            if not isinstance(answer_options, list):
                raise ValueError("Answer options JSON must be an array")
            payload = QuestionCreate(
                question_text=question_text,
                question_type=question_type_enum,
                points=int(points_raw),
                explanation=explanation,
                answer_options=answer_options,
                order_index=next_order,
            )
            await create_exam_question(
                assessment_uuid, payload, current_user, db_session
            )
            imported += 1
            next_order += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Строка {row_num}: {exc!s}")

    return {
        "imported": imported,
        "errors": errors,
        "total_rows": row_num - 1 if "row_num" in locals() else 0,
    }


def exam_authoring_config() -> dict[str, dict[str, int]]:
    return {
        "time_limit": {"min": TIME_LIMIT_MIN, "max": TIME_LIMIT_MAX},
        "violation_threshold": {
            "min": VIOLATION_THRESHOLD_MIN,
            "max": VIOLATION_THRESHOLD_MAX,
        },
        "question_limit": {"min": QUESTION_LIMIT_MIN},
    }


_ASSIGNMENT_ITEM_KINDS = {
    ItemKind.ASSIGNMENT_FILE,
    ItemKind.ASSIGNMENT_QUIZ,
    ItemKind.ASSIGNMENT_FORM,
    ItemKind.ASSIGNMENT_OTHER,
}


def _assignment_task_type_to_item_kind(
    task_type: AssignmentTaskTypeEnum | str,
) -> ItemKind:
    normalized = AssignmentTaskTypeEnum(task_type)
    if normalized == AssignmentTaskTypeEnum.FILE_SUBMISSION:
        return ItemKind.ASSIGNMENT_FILE
    if normalized == AssignmentTaskTypeEnum.QUIZ:
        return ItemKind.ASSIGNMENT_QUIZ
    if normalized == AssignmentTaskTypeEnum.FORM:
        return ItemKind.ASSIGNMENT_FORM
    return ItemKind.ASSIGNMENT_OTHER


def _assignment_task_type_from_item_kind(
    kind: ItemKind | str,
) -> AssignmentTaskTypeEnum:
    normalized = ItemKind(kind)
    if normalized == ItemKind.ASSIGNMENT_FILE:
        return AssignmentTaskTypeEnum.FILE_SUBMISSION
    if normalized == ItemKind.ASSIGNMENT_QUIZ:
        return AssignmentTaskTypeEnum.QUIZ
    if normalized == ItemKind.ASSIGNMENT_FORM:
        return AssignmentTaskTypeEnum.FORM
    return AssignmentTaskTypeEnum.OTHER


def _assignment_task_from_item(item: AssessmentReadItem) -> AssignmentTaskRead:
    body = item.body
    task_type = _assignment_task_type_from_item_kind(item.kind)
    description = getattr(body, "description", "")
    hint = getattr(body, "hint", "")
    reference_file = getattr(body, "reference_file", None)

    if body.kind == "ASSIGNMENT_FILE":
        contents = {
            "kind": "FILE_SUBMISSION",
            "allowed_mime_types": body.allowed_mime_types,
            "max_file_size_mb": body.max_file_size_mb,
            "max_files": body.max_files,
        }
    elif body.kind == "ASSIGNMENT_QUIZ":
        contents = {
            "kind": "QUIZ",
            "questions": [
                question.model_dump(mode="json") for question in body.questions
            ],
            "settings": body.settings.model_dump(mode="json"),
        }
    elif body.kind == "ASSIGNMENT_FORM":
        contents = {
            "kind": "FORM",
            "questions": [
                question.model_dump(mode="json") for question in body.questions
            ],
        }
    else:
        contents = {
            "kind": "OTHER",
            "body": body.body,
        }

    return AssignmentTaskRead.model_validate({
        "id": item.id,
        "assignment_task_uuid": item.item_uuid,
        "assignment_type": task_type,
        "title": item.title,
        "description": description,
        "hint": hint,
        "reference_file": reference_file,
        "max_grade_value": round(item.max_score),
        "contents": contents,
        "order": item.order,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    })


def _assignment_item_body_from_payload(payload: AssignmentTaskCreate):
    contents = payload.contents if isinstance(payload.contents, dict) else {}
    if payload.assignment_type == AssignmentTaskTypeEnum.FILE_SUBMISSION:
        return AssignmentFileItemBody(
            description=payload.description,
            hint=payload.hint or "",
            reference_file=payload.reference_file,
            allowed_mime_types=[
                item
                for item in contents.get("allowed_mime_types", [])
                if isinstance(item, str)
            ]
            if isinstance(contents.get("allowed_mime_types"), list)
            else [],
            max_file_size_mb=contents.get("max_file_size_mb")
            if isinstance(contents.get("max_file_size_mb"), int)
            else None,
            max_files=contents.get("max_files")
            if isinstance(contents.get("max_files"), int)
            else 1,
        )
    if payload.assignment_type == AssignmentTaskTypeEnum.QUIZ:
        return AssignmentQuizItemBody(
            description=payload.description,
            hint=payload.hint or "",
            questions=[
                AssignmentQuizQuestion.model_validate(question)
                for question in contents.get("questions", [])
                if isinstance(question, dict)
            ],
            settings=AssignmentQuizSettings.model_validate(
                contents.get("settings", {})
            ),
        )
    if payload.assignment_type == AssignmentTaskTypeEnum.FORM:
        return AssignmentFormItemBody(
            description=payload.description,
            hint=payload.hint or "",
            questions=[
                AssignmentFormQuestion.model_validate(question)
                for question in contents.get("questions", [])
                if isinstance(question, dict)
            ],
        )
    return AssignmentOtherItemBody(
        description=payload.description,
        hint=payload.hint or "",
        body=contents.get("body")
        if isinstance(contents.get("body"), dict)
        else contents,
    )


def _assignment_item_body_from_read(task: AssignmentTaskRead):
    if task.assignment_type == AssignmentTaskTypeEnum.FILE_SUBMISSION:
        return _assignment_item_body_from_payload(
            AssignmentTaskCreate(**task.model_dump())
        )
    if task.assignment_type == AssignmentTaskTypeEnum.QUIZ:
        return _assignment_item_body_from_payload(
            AssignmentTaskCreate(**task.model_dump())
        )
    if task.assignment_type == AssignmentTaskTypeEnum.FORM:
        return _assignment_item_body_from_payload(
            AssignmentTaskCreate(**task.model_dump())
        )
    return _assignment_item_body_from_payload(AssignmentTaskCreate(**task.model_dump()))


def _question_type_to_item_kind(question_type: QuestionTypeEnum | str) -> ItemKind:
    return (
        ItemKind.MATCHING
        if QuestionTypeEnum(question_type) == QuestionTypeEnum.MATCHING
        else ItemKind.CHOICE
    )


def _question_from_item(item: AssessmentReadItem) -> QuestionRead:
    body = item.body
    if body.kind == "MATCHING":
        question_type = QuestionTypeEnum.MATCHING
        answer_options = [
            {"left": pair.left, "right": pair.right, "option_id": index}
            for index, pair in enumerate(body.pairs)
        ]
        explanation = body.explanation
    else:
        variant = body.variant or (
            "MULTIPLE_CHOICE" if body.multiple else "SINGLE_CHOICE"
        )
        question_type = QuestionTypeEnum(variant)
        answer_options = [
            {
                "text": option.text,
                "is_correct": option.is_correct,
                "option_id": index,
            }
            for index, option in enumerate(body.options)
        ]
        explanation = body.explanation
    return QuestionRead.model_validate({
        "id": item.id,
        "question_uuid": item.item_uuid,
        "question_text": body.prompt,
        "question_type": question_type,
        "points": round(item.max_score),
        "explanation": explanation,
        "answer_options": answer_options,
        "order_index": item.order,
        "creation_date": item.created_at.isoformat(),
        "update_date": item.updated_at.isoformat(),
    })


def _question_item_body_from_payload(payload: QuestionCreate):
    return _question_item_body_from_parts(
        payload.question_text,
        payload.question_type,
        payload.answer_options,
        payload.explanation,
    )


def _question_item_body_from_read(payload: QuestionRead):
    return _question_item_body_from_parts(
        payload.question_text,
        payload.question_type,
        payload.answer_options,
        payload.explanation,
    )


def _question_item_body_from_parts(
    question_text: str,
    question_type: QuestionTypeEnum | str,
    answer_options: list[dict[str, object]],
    explanation: str | None,
):
    normalized_type = QuestionTypeEnum(question_type)
    if normalized_type == QuestionTypeEnum.MATCHING:
        return MatchingItemBody(
            prompt=question_text,
            pairs=[
                MatchPair(
                    left=str(option.get("left", "")),
                    right=str(option.get("right", "")),
                )
                for option in answer_options
            ],
            explanation=explanation,
        )
    multiple = normalized_type == QuestionTypeEnum.MULTIPLE_CHOICE
    return ChoiceItemBody(
        prompt=question_text,
        options=[
            ChoiceOption(
                id=str(option.get("option_id", index)),
                text=str(option.get("text", "")),
                is_correct=option.get("is_correct") is True,
            )
            for index, option in enumerate(answer_options)
        ],
        multiple=multiple,
        variant=normalized_type.value,
        explanation=explanation,
    )


def _validate_question_payload(
    question_text: str,
    question_type: QuestionTypeEnum | str,
    answer_options: list[dict[str, object]],
) -> None:
    if not question_text.strip():
        raise HTTPException(
            status_code=400, detail="Текст вопроса не может быть пустым"
        )
    if len(answer_options) == 0:
        raise HTTPException(
            status_code=400, detail="Требуется как минимум один вариант ответа"
        )
    if len(answer_options) > 10:
        raise HTTPException(
            status_code=400, detail="Слишком много вариантов ответа (макс. 10)"
        )
    normalized_type = QuestionTypeEnum(question_type)
    if normalized_type in {
        QuestionTypeEnum.SINGLE_CHOICE,
        QuestionTypeEnum.MULTIPLE_CHOICE,
        QuestionTypeEnum.TRUE_FALSE,
    } and not any(option.get("is_correct") for option in answer_options):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Необходим хотя бы один вариант, отмеченный как правильный",
        )
