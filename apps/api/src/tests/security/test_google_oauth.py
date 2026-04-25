from __future__ import annotations

from typing import Self

import httpx

from src.services.auth import google_oauth


class _FakeAsyncClient:
    def __init__(
        self,
        *,
        response: httpx.Response | None = None,
        error: Exception | None = None,
        timeout: float | None = None,
    ) -> None:
        self._response = response
        self._error = error

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def get(self, _url: str) -> httpx.Response:
        if self._error is not None:
            raise self._error
        assert self._response is not None
        return self._response


async def test_google_metadata_uses_builtin_fallback_when_discovery_times_out(
    monkeypatch,
) -> None:
    google_oauth._metadata_cache = {}
    google_oauth._metadata_cached_at = 0.0
    monkeypatch.setattr(
        google_oauth.httpx,
        "AsyncClient",
        lambda timeout=10.0: _FakeAsyncClient(
            error=httpx.ConnectTimeout("boom"),
            timeout=timeout,
        ),
    )

    metadata = await google_oauth._get_google_metadata()

    assert metadata == {
        "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_endpoint": "https://oauth2.googleapis.com/token",
        "userinfo_endpoint": "https://openidconnect.googleapis.com/v1/userinfo",
    }


async def test_google_metadata_prefers_stale_cache_when_refresh_fails(monkeypatch) -> None:
    stale_metadata = {
        "authorization_endpoint": "https://cached.example/auth",
        "token_endpoint": "https://cached.example/token",
        "userinfo_endpoint": "https://cached.example/userinfo",
    }
    google_oauth._metadata_cache = stale_metadata
    google_oauth._metadata_cached_at = 0.0
    monkeypatch.setattr(
        google_oauth,
        "time",
        type(
            "_FakeTime",
            (),
            {"monotonic": staticmethod(lambda: google_oauth._METADATA_CACHE_TTL + 1)},
        ),
    )
    monkeypatch.setattr(
        google_oauth.httpx,
        "AsyncClient",
        lambda timeout=10.0: _FakeAsyncClient(
            error=httpx.ConnectTimeout("boom"),
            timeout=timeout,
        ),
    )

    metadata = await google_oauth._get_google_metadata()

    assert metadata is stale_metadata
