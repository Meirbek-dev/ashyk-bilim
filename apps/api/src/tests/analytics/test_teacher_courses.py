import pytest

from src.security.rbac import PermissionDenied
from src.services.analytics.queries import _unwrap_model, _unwrap_pair, display_name
from src.services.analytics.scope import (
    TeacherAnalyticsScope,
    _coerce_course_id,
    ensure_course_in_scope,
)


class _FakeCourse:
    def __init__(self, course_id: int) -> None:
        self.id = course_id


class _FakeAssignment:
    def __init__(self, assignment_id: int) -> None:
        self.id = assignment_id


class _FakeSubmission:
    def __init__(self, user_id: int) -> None:
        self.user_id = user_id


class _FakeRow:
    def __init__(self, value: int) -> None:
        self._mapping = {"id": value}


class _FakeModelRow:
    def __init__(self, **values: object) -> None:
        self._mapping = values


def test_ensure_course_in_scope_allows_scoped_course() -> None:
    scope = TeacherAnalyticsScope(
        teacher_user_id=99,
        course_ids=[1, 2, 3],
        cohort_ids=[],
        has_platform_scope=False,
    )

    ensure_course_in_scope(scope, 2)


def test_ensure_course_in_scope_rejects_out_of_scope_course() -> None:
    scope = TeacherAnalyticsScope(
        teacher_user_id=99,
        course_ids=[1, 2, 3],
        cohort_ids=[],
        has_platform_scope=False,
    )

    with pytest.raises(PermissionDenied):
        ensure_course_in_scope(scope, 5)


@pytest.mark.parametrize(
    ("raw_value", "expected"),
    [
        (7, 7),
        ((8,), 8),
        (_FakeRow(9), 9),
        (None, None),
    ],
)
def test_coerce_course_id_handles_scalar_and_row_shapes(
    raw_value: object, expected: int | None
) -> None:
    assert _coerce_course_id(raw_value) == expected


def test_unwrap_model_returns_model_from_row_mapping() -> None:
    course = _FakeCourse(11)

    unwrapped = _unwrap_model(_FakeModelRow(course=course), _FakeCourse)

    assert unwrapped is course


def test_unwrap_pair_returns_models_from_row_mapping() -> None:
    submission = _FakeSubmission(5)
    assignment = _FakeAssignment(13)

    left, right = _unwrap_pair(
        _FakeModelRow(submission=submission, assignment=assignment),
        _FakeSubmission,
        _FakeAssignment,
    )

    assert left is submission
    assert right is assignment


def test_display_name_returns_russian_unknown_for_missing_user() -> None:
    assert display_name(None) == "Неизвестный пользователь"
