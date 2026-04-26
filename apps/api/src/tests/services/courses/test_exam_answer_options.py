from src.db.courses.exams import Question, QuestionReadStudent, QuestionTypeEnum
from src.services.courses.activities.exams import check_answer_correctness


def test_student_question_options_keep_original_option_ids_when_shuffled(
    monkeypatch,
):
    question = Question(
        id=1,
        question_uuid="question_test",
        exam_id=1,
        question_text="Pick the correct answer",
        question_type=QuestionTypeEnum.SINGLE_CHOICE,
        points=1,
        order_index=0,
        answer_options=[
            {"text": "Wrong", "is_correct": False},
            {"text": "Correct", "is_correct": True},
            {"text": "Also wrong", "is_correct": False},
        ],
    )

    monkeypatch.setattr("random.shuffle", lambda items: items.reverse())

    student_question = QuestionReadStudent.from_question(
        question,
        shuffle_answers=True,
    )

    assert student_question.answer_options == [
        {"text": "Also wrong", "option_id": 2},
        {"text": "Correct", "option_id": 1},
        {"text": "Wrong", "option_id": 0},
    ]
    assert all("is_correct" not in option for option in student_question.answer_options)
    assert check_answer_correctness(question, 1) is True


def test_student_matching_options_shuffle_right_values_without_option_ids(monkeypatch):
    question = Question(
        id=1,
        question_uuid="question_matching",
        exam_id=1,
        question_text="Match items",
        question_type=QuestionTypeEnum.MATCHING,
        points=1,
        order_index=0,
        answer_options=[
            {"left": "A", "right": "1"},
            {"left": "B", "right": "2"},
        ],
    )

    monkeypatch.setattr("random.shuffle", lambda items: items.reverse())

    student_question = QuestionReadStudent.from_question(
        question,
        shuffle_answers=True,
    )

    assert student_question.answer_options == [
        {"left": "A", "right": "2"},
        {"left": "B", "right": "1"},
    ]
