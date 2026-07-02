from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from src.db.ai_runtime import AIRun, AIThread
from src.db.courses.activities import Activity
from src.db.courses.courses import Course
from src.security.rbac import PermissionChecker
from src.services.ai import policy


def test_derive_course_ai_role_uses_server_side_course_permission(monkeypatch: pytest.MonkeyPatch) -> None:
    course = SimpleNamespace(id=1)
    user = SimpleNamespace(id=7)
    reads: list[int] = []

    monkeypatch.setattr(policy, "can_update_course", lambda *_args: False)
    monkeypatch.setattr(policy, "require_ai_course_read", lambda _db, course, _user: reads.append(course.id))

    assert policy.derive_course_ai_role(SimpleNamespace(), course, user) == "student"
    assert reads == [1]

    monkeypatch.setattr(policy, "can_update_course", lambda *_args: True)

    assert policy.derive_course_ai_role(SimpleNamespace(), course, user) == "teacher"


def test_require_ai_submission_access_allows_owner_without_teacher_permission() -> None:
    course = SimpleNamespace(id=11)

    class SessionStub:
        def get(self, model: object, _id: int) -> object | None:
            if model is Activity:
                return SimpleNamespace(course_id=11)
            if model is Course:
                return course
            return None

    submission = SimpleNamespace(user_id=7, activity_id=3)
    user = SimpleNamespace(id=7)

    assert policy.require_ai_submission_access(SessionStub(), submission, user) is course


def test_require_ai_submission_access_requires_course_update_for_other_students(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    course = SimpleNamespace(id=11)
    checked: list[int] = []

    class SessionStub:
        def get(self, model: object, _id: int) -> object | None:
            if model is Activity:
                return SimpleNamespace(course_id=11)
            if model is Course:
                return course
            return None

    monkeypatch.setattr(policy, "require_ai_course_update", lambda _db, course, _user: checked.append(course.id))

    submission = SimpleNamespace(user_id=8, activity_id=3)
    user = SimpleNamespace(id=7)

    assert policy.require_ai_submission_access(SessionStub(), submission, user) is course
    assert checked == [11]


def test_require_ai_run_access_allows_owner_and_blocks_other_users(monkeypatch: pytest.MonkeyPatch) -> None:
    run = AIRun(run_uuid="run_test", thread_id=1)
    thread = AIThread(thread_uuid="thread_test", user_id=7)

    class SessionStub:
        def get(self, model: object, _id: int) -> object | None:
            if model is AIThread:
                return thread
            return None

    policy.require_ai_run_access(SessionStub(), run, SimpleNamespace(id=7))

    thread.user_id = 8

    def deny(*_args: object, **_kwargs: object) -> None:
        raise HTTPException(status_code=403, detail="denied")

    monkeypatch.setattr(PermissionChecker, "require", deny)

    with pytest.raises(HTTPException) as exc_info:
        policy.require_ai_run_access(SessionStub(), run, SimpleNamespace(id=7))

    assert exc_info.value.status_code == 403
