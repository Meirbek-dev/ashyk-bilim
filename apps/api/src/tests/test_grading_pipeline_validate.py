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


def test_validate_and_parse_populates_defaults_for_missing_items() -> None:
    from src.db.assessments import (
        ChoiceItemBody,
        FormItemBody,
        CodeItemBody,
        MatchingItemBody,
    )

    items = [
        CanonicalAssessmentItem(
            item_uuid="q_choice",
            kind="CHOICE",
            title="Choice",
            body=ChoiceItemBody(prompt="Choose."),
            max_score=10,
        ),
        CanonicalAssessmentItem(
            item_uuid="q_opentext",
            kind="OPEN_TEXT",
            title="Open Text",
            body=OpenTextItemBody(prompt="Write."),
            max_score=10,
        ),
        CanonicalAssessmentItem(
            item_uuid="q_form",
            kind="FORM",
            title="Form",
            body=FormItemBody(prompt="Fill."),
            max_score=10,
        ),
        CanonicalAssessmentItem(
            item_uuid="q_code",
            kind="CODE",
            title="Code",
            body=CodeItemBody(prompt="Code.", languages=[71]),  # 71 could be python/java/etc
            max_score=10,
        ),
        CanonicalAssessmentItem(
            item_uuid="q_matching",
            kind="MATCHING",
            title="Matching",
            body=MatchingItemBody(prompt="Match."),
            max_score=10,
        ),
    ]

    # Empty payload
    payload = {}

    parsed = validate_and_parse(payload, items=items)

    # Check that answers_by_item_uuid has all 5 keys with correct defaults
    answers = parsed.answers_by_item_uuid
    assert len(answers) == 5

    assert answers["q_choice"].kind == "CHOICE"
    assert answers["q_choice"].selected == []

    assert answers["q_opentext"].kind == "OPEN_TEXT"
    assert answers["q_opentext"].text == ""

    assert answers["q_form"].kind == "FORM"
    assert answers["q_form"].values == {}

    assert answers["q_code"].kind == "CODE"
    assert answers["q_code"].language == 71
    assert answers["q_code"].source == ""

    assert answers["q_matching"].kind == "MATCHING"
    assert answers["q_matching"].matches == []

    # Check that payload["answers"] is updated for persistence
    raw_answers = parsed.raw_payload["answers"]
    assert isinstance(raw_answers, dict)
    assert raw_answers["q_choice"] == {"kind": "CHOICE", "selected": []}
    assert raw_answers["q_opentext"] == {"kind": "OPEN_TEXT", "text": ""}
    assert raw_answers["q_form"] == {"kind": "FORM", "values": {}}
    assert raw_answers["q_code"] == {
        "kind": "CODE",
        "language": 71,
        "source": "",
        "latest_run": None,
    }
    assert raw_answers["q_matching"] == {"kind": "MATCHING", "matches": []}
