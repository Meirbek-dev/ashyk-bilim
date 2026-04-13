from src.db.courses.assignments import AssignmentTask, AssignmentTaskTypeEnum
from src.db.grading.submissions import GradedItem, GradingBreakdown
from src.services.grading.assignment_breakdown import build_assignment_breakdown


def make_task(task_uuid: str, title: str, max_grade_value: int) -> AssignmentTask:
    return AssignmentTask(
        id=None,
        assignment_task_uuid=task_uuid,
        title=title,
        description="",
        hint="",
        reference_file=None,
        assignment_type=AssignmentTaskTypeEnum.OTHER,
        contents={},
        max_grade_value=max_grade_value,
        creation_date="2026-04-12T00:00:00Z",
        update_date="2026-04-12T00:00:00Z",
        assignment_id=1,
        course_id=1,
        chapter_id=1,
        activity_id=1,
    )


def test_build_assignment_breakdown_synthesizes_items_from_answers() -> None:
    breakdown = build_assignment_breakdown(
        GradingBreakdown(),
        {
            "tasks": [
                {
                    "task_uuid": "task-1",
                    "content_type": "text",
                    "text_content": "Draft response",
                },
                {
                    "task_uuid": "task-2",
                    "content_type": "file",
                    "file_key": "uploads/essay.pdf",
                },
            ]
        },
        [
            make_task("task-1", "Short answer", 40),
            make_task("task-2", "Essay upload", 60),
        ],
    )

    assert [item.item_id for item in breakdown.items] == ["task-1", "task-2"]
    assert [item.item_text for item in breakdown.items] == [
        "Short answer",
        "Essay upload",
    ]
    assert [item.max_score for item in breakdown.items] == [40.0, 60.0]
    assert breakdown.items[0].user_answer == {
        "content_type": "text",
        "text_content": "Draft response",
    }
    assert breakdown.items[1].user_answer == {
        "content_type": "file",
        "file_key": "uploads/essay.pdf",
    }
    assert breakdown.needs_manual_review is True
    assert breakdown.auto_graded is False


def test_build_assignment_breakdown_preserves_existing_teacher_grading() -> None:
    existing = GradingBreakdown(
        items=[
            GradedItem(
                item_id="task-1",
                item_text="",
                score=35,
                max_score=0,
                feedback="Strong work",
                needs_manual_review=False,
            )
        ],
        needs_manual_review=False,
        auto_graded=False,
        feedback="Overall feedback",
    )

    breakdown = build_assignment_breakdown(
        existing,
        {
            "tasks": [
                {
                    "task_uuid": "task-1",
                    "content_type": "text",
                    "text_content": "Submitted answer",
                }
            ]
        },
        [make_task("task-1", "Refined prompt", 50)],
    )

    assert len(breakdown.items) == 1
    assert breakdown.items[0].item_text == "Refined prompt"
    assert breakdown.items[0].score == 35
    assert breakdown.items[0].max_score == 50.0
    assert breakdown.items[0].feedback == "Strong work"
    assert breakdown.items[0].needs_manual_review is False
    assert breakdown.items[0].user_answer == {
        "content_type": "text",
        "text_content": "Submitted answer",
    }
    assert breakdown.feedback == "Overall feedback"
    assert breakdown.needs_manual_review is False
