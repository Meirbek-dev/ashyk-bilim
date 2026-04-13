from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import Request
from sqlmodel import Session

from src.services.users.users import get_user_session


def test_get_user_session_includes_access_expiry_and_session_version(
    monkeypatch: pytest.MonkeyPatch,
):
    request = Mock(spec=Request)
    db_session = Mock(spec=Session)
    current_user = SimpleNamespace(id=1, user_uuid="user_123")

    user = SimpleNamespace(
        id=1,
        user_uuid="user_123",
        username="tester",
        first_name="Test",
        middle_name="",
        last_name="User",
        email="test@example.com",
        avatar_image="",
        bio="",
        details={},
        profile={},
        theme="default",
        locale="ru-RU",
    )

    checker = Mock()
    checker.get_user_roles.return_value = []
    checker.get_expanded_permissions.return_value = {"course:create:platform"}

    def fake_get_user(_db_session, _field, _value, use_cache: bool = True):
        return user

    monkeypatch.setattr("src.services.users.users._get_user_by_field", fake_get_user)
    monkeypatch.setattr(
        "src.services.users.users.PermissionChecker", lambda _db_session: checker
    )
    monkeypatch.setattr(
        "src.security.auth.get_access_token_from_request",
        lambda _request, _token=None: "token",
    )
    monkeypatch.setattr(
        "src.security.auth.decode_access_token",
        lambda _token: SimpleNamespace(
            expires_at=1_700_000_000, issued_at=1_699_999_000
        ),
    )

    session = get_user_session(request, db_session, current_user)

    assert session.user.user_uuid == "user_123"
    assert session.permissions == ["course:create:platform"]
    assert session.expires_at == 1_700_000_000_000
    assert session.session_version == 1_699_999_000
