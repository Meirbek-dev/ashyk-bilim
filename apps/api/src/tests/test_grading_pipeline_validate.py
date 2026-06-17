# pyright: reportMissingImports=false
"""Regression tests for canonical answer validation."""

import pathlib
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from src.db.assessments import OpenTextItemBody
from src.services.grading.pipeline.validate import _OPEN_TEXT_MAX_CHARS, validate_and_parse
from src.services.grading.settings_loader import CanonicalAssessmentItem


def test_open_text_answer_max_chars_is_enforced() -> None:
    item = CanonicalAssessmentItem(
        item_uuid="item_open_text",
        kind="OPEN_TEXT",
        title="Explain",
        body=OpenTextItemBody(prompt="Explain."),
        max_score=100,
    )
    payload = {
        "answers": {
            "item_open_text": {
                "kind": "OPEN_TEXT",
                "text": "x" * (_OPEN_TEXT_MAX_CHARS + 1),
            }
        }
    }

    with pytest.raises(HTTPException) as exc_info:
        validate_and_parse(payload, items=[item])

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail["code"] == "open_text_too_long"
