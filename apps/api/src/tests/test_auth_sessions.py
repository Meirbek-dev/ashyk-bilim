import pytest

from src.services.auth import sessions
from src.services.auth.sessions import SessionData, hash_refresh_token


class _FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.values[key] = value


class _NoRecordResult:
    def first(self) -> None:
        return None


class _NoRecordSession:
    def exec(self, _statement: object) -> _NoRecordResult:
        return _NoRecordResult()


def _session_data(session_id: str, refresh_token_hash: str) -> SessionData:
    return SessionData(
        session_id=session_id,
        token_family_id="fam_test",
        user_id=123,
        user_uuid="user_test",
        refresh_token_hash=refresh_token_hash,
        ip_address="127.0.0.1",
        user_agent="test-agent",
        created_at=100,
        last_seen_at=100,
        rotated_count=0,
        absolute_expires_at=1000,
    )


@pytest.mark.asyncio
async def test_recently_rotated_refresh_token_does_not_report_reuse(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_redis = _FakeRedis()
    old_refresh_token = "sess_old.refresh-secret"
    old_session = _session_data("sess_old", hash_refresh_token(old_refresh_token))
    new_session = _session_data("sess_new", "new_hash")

    monkeypatch.setattr(sessions, "get_async_redis_client", lambda: fake_redis)

    await sessions._write_rotation_grace(old_session, new_session, rotated_at=123)
    inspection = await sessions.inspect_refresh_session(_NoRecordSession(), old_refresh_token)  # type: ignore[arg-type]

    assert inspection.status == "rotated"
    assert inspection.session_id == "sess_old"
    assert inspection.token_family_id == "fam_test"
    assert inspection.user_id == 123
