from src.db.assessments import ChoiceItemBody, ChoiceOption, OpenTextItemBody
from src.services.grading.quiz_grader import grade_canonical_choice_items
from src.services.grading.settings_loader import CanonicalAssessmentItem


def test_mixed_choice_and_open_text_requires_manual_review() -> None:
    choice = CanonicalAssessmentItem(
        item_uuid="item_choice",
        kind="CHOICE",
        title="Pick one",
        body=ChoiceItemBody(
            prompt="Pick one",
            options=[
                ChoiceOption(id="a", text="A", is_correct=True),
                ChoiceOption(id="b", text="B", is_correct=False),
            ],
        ),
        max_score=50,
    )
    open_text = CanonicalAssessmentItem(
        item_uuid="item_open",
        kind="OPEN_TEXT",
        title="Explain",
        body=OpenTextItemBody(prompt="Explain"),
        max_score=50,
    )

    score, breakdown = grade_canonical_choice_items(
        [choice, open_text],
        {
            "item_choice": {"kind": "CHOICE", "selected": ["a"]},
            "item_open": {"kind": "OPEN_TEXT", "text": "Because..."},
        },
    )

    assert score == 50
    assert breakdown.needs_manual_review is True
    assert [item.item_id for item in breakdown.items] == ["item_choice", "item_open"]
    assert breakdown.items[1].needs_manual_review is True
    assert breakdown.items[1].max_score == 50
