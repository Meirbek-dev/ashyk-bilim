from __future__ import annotations

from datetime import datetime
from unittest.mock import Mock

import pytest

from src.db.courses.activities import Activity
from src.db.courses.chapters import Chapter
from src.db.courses.courses import Course
from src.db.courses.exams import Exam, ExamCreateWithActivity
from src.db.users import PublicUser
from src.services.courses.activities import exams as exam_service


class _ExecResult:
    def __init__(self, *, first_value=None) -> None:
        self._first_value = first_value

    def first(self):
        return self._first_value


class _FakeSession:
    def __init__(self, *, chapter: Chapter, course: Course) -> None:
        self.chapter = chapter
        self.course = course
        self.added: list[object] = []
        self._next_id = 1

    def get(self, model, object_id: int):
        if model is Chapter and object_id == self.chapter.id:
            return self.chapter
        if model is Course and object_id == self.course.id:
            return self.course
        return None

    def exec(self, _statement) -> _ExecResult:
        return _ExecResult(first_value=None)

    def add(self, model: object) -> None:
        if getattr(model, "id", None) is None:
            model.id = self._next_id
            self._next_id += 1
        self.added.append(model)

    def flush(self) -> None:
        for model in self.added:
            if getattr(model, "id", None) is None:
                model.id = self._next_id
                self._next_id += 1

    def commit(self) -> None:
        return None

    def refresh(self, _model: object) -> None:
        return None


@pytest.mark.asyncio
async def test_create_exam_with_activity_uses_datetime_fields_and_sets_creator(
    monkeypatch: pytest.MonkeyPatch,
):
    checker = Mock()
    checker.require.return_value = None
    monkeypatch.setattr(
        exam_service,
        "PermissionChecker",
        Mock(return_value=checker),
    )

    course = Course(
        id=10,
        name="Course",
        description="",
        about="",
        learnings="",
        tags="",
        thumbnail_image="",
        public=False,
        open_to_contributors=False,
        course_uuid="course_test",
        creator_id=42,
    )
    chapter = Chapter(
        id=20,
        name="Chapter",
        chapter_uuid="chapter_test",
        course_id=course.id,
        creator_id=42,
    )
    current_user = PublicUser(
        id=42,
        user_uuid="user_42",
        username="teacher",
        first_name="Test",
        middle_name="",
        last_name="Teacher",
        email="teacher@example.com",
        avatar_image="",
        bio="",
        details={},
        profile={},
        theme="default",
        locale="en-US",
    )
    session = _FakeSession(chapter=chapter, course=course)

    result = await exam_service.create_exam_with_activity(
        request=None,  # type: ignore[arg-type]
        exam_object=ExamCreateWithActivity(
            activity_name="Final test",
            chapter_id=chapter.id,
            exam_title="Final test",
            exam_description="Checks the chapter material",
            settings={},
        ),
        current_user=current_user,
        db_session=session,  # type: ignore[arg-type]
    )

    created_activity = next(
        model for model in session.added if isinstance(model, Activity)
    )
    created_exam = next(model for model in session.added if isinstance(model, Exam))

    assert created_activity.creator_id == current_user.id
    assert isinstance(created_activity.creation_date, datetime)
    assert isinstance(created_activity.update_date, datetime)
    assert created_exam.activity_id == created_activity.id
    assert result["activity_uuid"] == created_activity.activity_uuid
