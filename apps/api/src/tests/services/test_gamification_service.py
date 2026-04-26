from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from src.db.gamification import XPSource
from src.services.gamification import service


class _ExecResult:
    def __init__(self, *, first_value=None) -> None:
        self._first_value = first_value

    def first(self):
        return self._first_value


class _FakeSession:
    def __init__(self, responses: list[_ExecResult]) -> None:
        self._responses = responses
        self._index = 0
        self.added = []
        self.flush_called = False
        self.commit_called = False

    def exec(self, _statement) -> _ExecResult:
        response = self._responses[self._index]
        self._index += 1
        return response

    def add(self, value) -> None:
        self.added.append(value)

    def flush(self) -> None:
        self.flush_called = True

    def commit(self) -> None:
        self.commit_called = True

    def refresh(self, _value) -> None:
        return None


def test_award_xp_short_circuits_when_idempotency_key_already_exists(
    monkeypatch,
) -> None:
    profile = SimpleNamespace(
        user_id=1,
        total_xp=100,
        level=2,
        updated_at=datetime(2026, 1, 1, tzinfo=UTC),
        last_xp_award_date=None,
        daily_xp_earned=0,
    )
    existing_tx = SimpleNamespace(
        id=9,
        user_id=1,
        amount=10,
        source=XPSource.LOGIN_BONUS,
        source_id=None,
        previous_level=2,
        triggered_level_up=True,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    session = _FakeSession([_ExecResult(first_value=existing_tx)])

    monkeypatch.setattr(service, "get_profile", lambda db, user_id: profile)
    monkeypatch.setattr(
        service,
        "get_policy",
        lambda db: (
            {XPSource.LOGIN_BONUS.value: 10},
            500,
        ),
    )

    resolved_profile, transaction, level_up, is_new = service.award_xp(
        db=session,  # type: ignore[arg-type]
        user_id=1,
        source=XPSource.LOGIN_BONUS.value,
        idempotency_key="login_bonus_1_2026-04-25",
    )

    assert resolved_profile is profile
    assert transaction is existing_tx
    assert level_up is True
    assert is_new is False
    assert session.flush_called is False
    assert session.commit_called is False
    assert session.added == []
