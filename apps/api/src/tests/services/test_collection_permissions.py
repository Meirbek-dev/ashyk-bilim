from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from src.db.collections import Collection
from src.db.users import AnonymousUser
from src.services.courses.collections import get_collection


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


@pytest.mark.asyncio
async def test_get_collection_sets_owner_true_when_creator_matches_user_id():
    collection = Collection(
        id=1,
        name="Collection",
        public=True,
        description="",
        creator_id=42,
        collection_uuid="collection_123",
        creation_date="2026-01-01T00:00:00Z",
        update_date="2026-01-01T00:00:00Z",
    )

    session = _FakeSession([
        _ExecResult(first_value=collection),
        _ExecResult(all_value=[]),
    ])

    checker = Mock()
    checker.require.return_value = None
    checker.check.side_effect = [True, True]

    user = SimpleNamespace(id=42, user_uuid="user_42")

    result = await get_collection(
        request=None,  # type: ignore[arg-type]
        collection_uuid="collection_123",
        current_user=user,
        db_session=session,  # type: ignore[arg-type]
        checker=checker,
    )

    assert result.is_owner is True


@pytest.mark.asyncio
async def test_get_collection_sets_owner_false_when_creator_differs_from_user_id():
    collection = Collection(
        id=1,
        name="Collection",
        public=True,
        description="",
        creator_id=77,
        collection_uuid="collection_123",
        creation_date="2026-01-01T00:00:00Z",
        update_date="2026-01-01T00:00:00Z",
    )

    session = _FakeSession([
        _ExecResult(first_value=collection),
        _ExecResult(all_value=[]),
    ])

    checker = Mock()
    checker.require.return_value = None
    checker.check.side_effect = [True, True]

    user = SimpleNamespace(id=42, user_uuid="user_42")

    result = await get_collection(
        request=None,  # type: ignore[arg-type]
        collection_uuid="collection_123",
        current_user=user,
        db_session=session,  # type: ignore[arg-type]
        checker=checker,
    )

    assert result.is_owner is False


@pytest.mark.asyncio
async def test_get_public_collection_allows_anonymous_without_rbac_check():
    collection = Collection(
        id=1,
        name="Collection",
        public=True,
        description="",
        creator_id=77,
        collection_uuid="collection_public",
        creation_date="2026-01-01T00:00:00Z",
        update_date="2026-01-01T00:00:00Z",
    )

    session = _FakeSession([
        _ExecResult(first_value=collection),
        _ExecResult(all_value=[]),
    ])

    checker = Mock()
    checker.check.side_effect = [False, False]

    result = await get_collection(
        request=None,  # type: ignore[arg-type]
        collection_uuid="collection_public",
        current_user=AnonymousUser(),
        db_session=session,  # type: ignore[arg-type]
        checker=checker,
    )

    checker.require.assert_not_called()
    assert result.public is True
    assert result.can_update is False
    assert result.can_delete is False
    assert result.is_owner is False
