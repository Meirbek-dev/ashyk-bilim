from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from src.db.users import User
from src.security.rbac import ResourceAccessDenied
from src.services.users.users import _get_user_by_field


def test_get_user_by_field_returns_from_cache():
    mock_db = Mock()
    # Mock cache to return serialized user
    cached = {"id": 1, "username": "alice", "email": "a@x.com", "user_uuid": "user_1"}

    with patch("src.services.cache.redis_client.get_json", return_value=cached):
        user = _get_user_by_field(mock_db, "id", 1)
        assert user.id == 1
        assert user.username == "alice"


def test_get_user_by_field_sets_cache_after_db_fetch(monkeypatch):
    # Mock DB to return a User-like object
    mock_user = SimpleNamespace(
        id=2,
        username="bob",
        email="b@x.com",
        user_uuid="user_2",
        model_dump=lambda: {"id": 2, "username": "bob"},
    )
    mock_db = Mock()
    mock_db.exec.return_value.first.return_value = mock_user

    set_calls = []

    def fake_set_json(k, v, ttl) -> None:
        set_calls.append((k, v, ttl))

    # Mock get_json to return None (cache miss) so set_json gets called
    monkeypatch.setattr("src.services.cache.redis_client.get_json", lambda k: None)
    monkeypatch.setattr("src.services.cache.redis_client.set_json", fake_set_json)

    user = _get_user_by_field(mock_db, "id", 2)
    assert user.id == 2
    assert len(set_calls) >= 1
    assert set_calls[0][0] == "user:id:2"


def test_update_user_invalidates_cache(monkeypatch):
    # Setup user and db session for update_user
    from src.services.users.users import update_user

    current_user = SimpleNamespace(id=1, user_uuid="user_1")
    db_session = Mock()

    # Mock _get_user_by_field to return a user
    user = SimpleNamespace(id=3, username="charlie", user_uuid="user_3")

    def fake_get_user(db, field, value, use_cache: bool = True):
        return user

    monkeypatch.setattr("src.services.users.users._get_user_by_field", fake_get_user)

    # Patch delete_keys
    delete_calls = []

    def fake_delete_keys(*keys) -> None:
        delete_calls.append(keys)

    monkeypatch.setattr("src.services.cache.redis_client.delete_keys", fake_delete_keys)

    # Call update_user with no changes (just triggers invalidation flow after updating)
    user_update = Mock()
    user_update.model_dump.return_value = {}

    # Provide a dummy current_user as PublicUser
    update_user(Mock(), db_session, 3, current_user, user_update)

    assert delete_calls
    # Keys should include id and username
    keys = delete_calls[0]
    assert f"user:id:{user.id}" in keys
    assert f"user:username:{user.username.lower()}" in keys


def test_update_user_preferences_updates_own_preferences_without_rbac(monkeypatch):
    from src.services.users.users import update_user_preferences

    user = User(
        id=3,
        username="charlie",
        first_name="Charlie",
        last_name="User",
        email="charlie@example.com",
        user_uuid="user_3",
        theme="default",
        locale="ru-RU",
    )
    db_session = Mock()

    def fake_get_user(db, field, value, use_cache: bool = True):
        assert field == "id"
        assert value == 3
        assert use_cache is False
        return user

    delete_calls = []

    monkeypatch.setattr("src.services.users.users._get_user_by_field", fake_get_user)
    monkeypatch.setattr(
        "src.services.cache.redis_client.delete_keys",
        lambda *keys: delete_calls.append(keys),
    )

    updated = update_user_preferences(
        Mock(),
        db_session,
        3,
        SimpleNamespace(id=3),
        theme="shadcn-default",
        locale="kk-KZ",
    )

    assert updated.theme == "shadcn-default"
    assert updated.locale == "kk-KZ"
    db_session.add.assert_called_once_with(user)
    db_session.commit.assert_called_once()
    db_session.refresh.assert_called_once_with(user)
    assert ("user:id:3", "user:username:charlie") in delete_calls


def test_update_user_preferences_rejects_other_users():
    from src.services.users.users import update_user_preferences

    with pytest.raises(ResourceAccessDenied):
        update_user_preferences(Mock(), Mock(), 4, SimpleNamespace(id=3), theme="default")
