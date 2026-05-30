"""Pipeline stage: validate and parse submission answers.

This stage normalizes the raw answers payload into canonical typed answers
keyed by item_uuid. No legacy fallback paths — only the canonical format
is accepted.
"""

from __future__ import annotations

from typing import Any, NoReturn

from fastapi import HTTPException, status
from pydantic import ValidationError

from src.db.assessments import ITEM_ANSWER_ADAPTER
from src.services.grading.pipeline.context import ParsedAnswers
from src.services.grading.settings_loader import CanonicalAssessmentItem

# Hard limit on open-text answer length to prevent DoS via huge payloads.
_OPEN_TEXT_MAX_CHARS: int = 50_000


def validate_and_parse(
    answers_payload: object,
    *,
    items: list[CanonicalAssessmentItem],
) -> ParsedAnswers:
    """Parse a raw answers payload into canonical typed answers.

    Accepts two canonical formats:
      1. {"answers": {"item_uuid": {...answer...}, ...}}  (dict keyed by uuid)
      2. {"answers": [{"item_uuid": "...", "answer": {...}}, ...]}  (list of entries)

    Raises 422 if the payload contains legacy fields, unknown items, missing
    items, malformed answers, or answer kinds that do not match the assessment
    item definition.
    """
    if not isinstance(answers_payload, dict):
        _raise_invalid("Тело ответов должно быть объектом")

    answers_by_item_uuid = _extract_canonical_answers(answers_payload)
    if not answers_by_item_uuid:
        _raise_invalid("В отправке должны быть канонические ответы", code="empty_answers")

    item_by_uuid = {item.item_uuid: item for item in items}
    unknown_items = sorted(set(answers_by_item_uuid) - set(item_by_uuid))
    if unknown_items:
        _raise_invalid(
            "В отправке есть ответы для неизвестных элементов оценивания",
            code="unknown_item",
            extra={"item_uuids": unknown_items},
        )

    missing_items = sorted(set(item_by_uuid) - set(answers_by_item_uuid))
    if missing_items:
        _raise_invalid(
            "В отправке отсутствуют ответы для обязательных элементов оценивания",
            code="missing_item",
            extra={"item_uuids": missing_items},
        )

    for item_uuid, answer in answers_by_item_uuid.items():
        item = item_by_uuid[item_uuid]
        answer_kind = getattr(answer, "kind", None)
        if answer_kind is None and isinstance(answer, dict):
            answer_kind = answer.get("kind")
        if str(answer_kind) != str(item.kind):
            _raise_invalid(
                "Тип ответа не совпадает с типом элемента оценивания",
                code="answer_kind_mismatch",
                extra={
                    "item_uuid": item_uuid,
                    "expected": str(item.kind),
                    "actual": str(answer_kind),
                },
            )

    return ParsedAnswers(
        answers_by_item_uuid=answers_by_item_uuid,
        raw_payload=answers_payload,
    )


def _extract_canonical_answers(answers_payload: object) -> dict[str, Any]:
    """Extract canonical answers from the payload.

    Supports dict-keyed and list-of-entries formats.
    """
    if not isinstance(answers_payload, dict):
        _raise_invalid("Тело ответов должно быть объектом")

    raw_answers = answers_payload.get("answers")

    # Format 1: dict keyed by item_uuid
    if isinstance(raw_answers, dict):
        normalized: dict[str, Any] = {}
        for item_uuid, raw_answer in raw_answers.items():
            if not isinstance(item_uuid, str):
                _raise_invalid("Ключи ответов должны быть строками UUID элементов")
            try:
                normalized[item_uuid] = ITEM_ANSWER_ADAPTER.validate_python(raw_answer)
            except ValidationError as exc:
                _raise_invalid(
                    "Некорректное тело канонического ответа",
                    code="malformed_answer",
                    extra={"item_uuid": item_uuid, "errors": exc.errors()},
                )
        return normalized

    # Format 2: list of {item_uuid, answer} entries
    if isinstance(raw_answers, list):
        normalized = {}
        for entry in raw_answers:
            if not isinstance(entry, dict):
                _raise_invalid("Записи ответов должны быть объектами")
            item_uuid = entry.get("item_uuid")
            raw_answer = entry.get("answer")
            if not isinstance(item_uuid, str) or not isinstance(raw_answer, dict):
                _raise_invalid(
                    "Записи ответов должны содержать item_uuid и объект ответа",
                    code="malformed_answer_entry",
                )
            try:
                normalized[item_uuid] = ITEM_ANSWER_ADAPTER.validate_python(raw_answer)
            except ValidationError as exc:
                _raise_invalid(
                    "Некорректное тело канонического ответа",
                    code="malformed_answer",
                    extra={"item_uuid": item_uuid, "errors": exc.errors()},
                )
        return normalized

    _raise_invalid("В отправке должны быть ответы", code="empty_answers")
    return None


def _raise_invalid(
    message: str,
    *,
    code: str = "invalid_answer_payload",
    extra: dict[str, Any] | None = None,
) -> NoReturn:
    detail: dict[str, Any] = {"code": code, "message": message}
    if extra:
        detail.update(extra)
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=detail,
    )
