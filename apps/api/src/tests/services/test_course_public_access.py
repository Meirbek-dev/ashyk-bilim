from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, Mock

import pytest

from src.db.courses.courses import Course
from src.db.resource_authors import (
    ResourceAuthor,
    ResourceAuthorshipEnum,
    ResourceAuthorshipStatusEnum,
)
from src.db.users import AnonymousUser, PublicUser
from src.services.courses import chapters as chapter_service
from src.services.courses._auth import require_course_read_access
from src.services.courses.courses import get_course, get_course_by_id, get_course_meta


class _ExecResult:
    def __init__(self, *, first_value=None, all_value=None) -> None:
        self._first_value = first_value
        self._all_value = all_value

    def first(self):
        return self._first_value

    def all(self):
        return self._all_value


class _FakeSession:
    def __init__(self, responses: list[_ExecResult]) -> None:
        self._responses = responses
        self._index = 0

    def exec(self, _statement) -> _ExecResult:
        response = self._responses[self._index]
        self._index += 1
        return response


def _public_course() -> Course:
    return Course(
        id=1,
        name="Public course",
        description="",
        about="",
        learnings="",
        tags="",
        thumbnail_image="",
        public=True,
        open_to_contributors=False,
        course_uuid="course_public",
        creator_id=77,
        creation_date=datetime(2026, 1, 1, tzinfo=UTC),
        update_date=datetime(2026, 1, 1, tzinfo=UTC),
    )


def _raw_public_course() -> Course:
    return Course(
        id=2,
        name="Raw UUID course",
        description="",
        about="",
        learnings="",
        tags="",
        thumbnail_image="",
        public=True,
        open_to_contributors=False,
        course_uuid="public",
        creator_id=88,
        creation_date=datetime(2026, 1, 1, tzinfo=UTC),
        update_date=datetime(2026, 1, 1, tzinfo=UTC),
    )


def _private_course() -> Course:
    return Course(
        id=3,
        name="Private course",
        description="",
        about="",
        learnings="",
        tags="",
        thumbnail_image="",
        public=False,
        open_to_contributors=False,
        course_uuid="course_private",
        creator_id=77,
        creation_date=datetime(2026, 1, 1, tzinfo=UTC),
        update_date=datetime(2026, 1, 1, tzinfo=UTC),
    )


@pytest.mark.asyncio
async def test_require_course_read_access_allows_active_author_on_private_course():
    course = _private_course()
    author = ResourceAuthor(
        id=1,
        resource_uuid=course.course_uuid,
        user_id=10,
        authorship=ResourceAuthorshipEnum.CONTRIBUTOR,
        authorship_status=ResourceAuthorshipStatusEnum.ACTIVE,
        creation_date="2026-01-01T00:00:00Z",
        update_date="2026-01-01T00:00:00Z",
    )
    session = _FakeSession([_ExecResult(first_value=author)])
    checker = Mock()
    checker.db = session
    checker.require = Mock()

    current_user = PublicUser(
        id=10,
        user_uuid="user_10",
        username="user10",
        first_name="Test",
        middle_name="",
        last_name="User",
        email="user10@example.com",
        avatar_image="",
        bio="",
        details={},
        profile={},
        theme="default",
        locale="en-US",
    )

    require_course_read_access(current_user, course, checker)

    checker.require.assert_called_once_with(
        current_user.id,
        "course:read",
        resource_owner_id=course.creator_id,
        is_owner=True,
    )


@pytest.mark.asyncio
async def test_get_public_course_allows_anonymous_without_rbac_check():
    session = _FakeSession(
        [
            _ExecResult(first_value=_public_course()),
            _ExecResult(all_value=[]),
        ]
    )
    checker = Mock()

    result = await get_course(
        request=None,  # type: ignore[arg-type]
        course_uuid="course_public",
        current_user=AnonymousUser(),
        db_session=session,  # type: ignore[arg-type]
        checker=checker,
    )

    checker.require.assert_not_called()
    assert result.course_uuid == "course_public"
    assert result.public is True


@pytest.mark.asyncio
async def test_get_public_course_by_id_allows_anonymous_without_rbac_check():
    session = _FakeSession(
        [
            _ExecResult(first_value=_public_course()),
            _ExecResult(all_value=[]),
        ]
    )
    checker = Mock()

    result = await get_course_by_id(
        request=None,  # type: ignore[arg-type]
        course_id=1,
        current_user=AnonymousUser(),
        db_session=session,  # type: ignore[arg-type]
        checker=checker,
    )

    checker.require.assert_not_called()
    assert result.id == 1
    assert result.public is True


@pytest.mark.asyncio
async def test_get_course_falls_back_to_raw_uuid_when_prefixed_lookup_misses():
    session = _FakeSession(
        [
            _ExecResult(first_value=None),
            _ExecResult(first_value=_raw_public_course()),
            _ExecResult(all_value=[]),
        ]
    )
    checker = Mock()

    result = await get_course(
        request=None,  # type: ignore[arg-type]
        course_uuid="course_public",
        current_user=AnonymousUser(),
        db_session=session,  # type: ignore[arg-type]
        checker=checker,
    )

    checker.require.assert_not_called()
    assert result.course_uuid == "public"
    assert result.public is True


@pytest.mark.asyncio
async def test_get_course_meta_falls_back_to_raw_uuid_when_prefixed_lookup_misses(
    monkeypatch: pytest.MonkeyPatch,
):
    session = _FakeSession(
        [
            _ExecResult(first_value=None),
            _ExecResult(first_value=_raw_public_course()),
            _ExecResult(all_value=[(_raw_public_course(), None, None)]),
        ]
    )
    monkeypatch.setattr(
        chapter_service, "get_course_chapters", AsyncMock(return_value=[])
    )

    result = await get_course_meta(
        request=None,  # type: ignore[arg-type]
        course_uuid="course_public",
        with_unpublished_activities=False,
        current_user=AnonymousUser(),
        db_session=session,  # type: ignore[arg-type]
        checker=None,
    )

    assert result.course_uuid == "public"
    assert result.public is True
    assert result.chapters == []
