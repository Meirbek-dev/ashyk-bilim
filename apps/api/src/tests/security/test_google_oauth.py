from __future__ import annotations

from typing import Self

import httpx
import jwt as pyjwt
import pytest

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


async def test_google_metadata_prefers_stale_cache_when_refresh_fails(
    monkeypatch,
) -> None:
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


@pytest.mark.asyncio
async def test_exchange_google_code_retries_transient_token_timeout(
    monkeypatch,
) -> None:
    attempts = {"post": 0}
    google_oauth._metadata_cache = {
        "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_endpoint": "https://oauth2.googleapis.com/token",
        "userinfo_endpoint": "https://openidconnect.googleapis.com/v1/userinfo",
    }
    google_oauth._metadata_cached_at = google_oauth.time.monotonic()

    class _RetryClient:
        def __init__(self, *_args, **_kwargs) -> None:
            return None

        async def __aenter__(self) -> Self:
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, _url: str, data: dict[str, str]) -> httpx.Response:
            attempts["post"] += 1
            if attempts["post"] == 1:
                raise httpx.ConnectTimeout("boom")
            return httpx.Response(
                200,
                json={"access_token": "token"},
                request=httpx.Request("POST", _url),
            )

        async def get(
            self, _url: str, headers: dict[str, str] | None = None
        ) -> httpx.Response:
            assert headers == {"Authorization": "Bearer token"}
            return httpx.Response(
                200,
                json={"email": "user@example.com"},
                request=httpx.Request("GET", _url),
            )

    monkeypatch.setattr(
        google_oauth, "_build_google_client", lambda timeout: _RetryClient()
    )

    userinfo = await google_oauth.exchange_google_code(
        client_id="client",
        client_secret="secret",
        code="code",
        redirect_uri="https://example.test/api/v1/auth/google/callback",
        state=None,
    )

    assert attempts["post"] == 2
    assert userinfo["email"] == "user@example.com"
    assert userinfo["frontend_callback"] == "/"


@pytest.mark.asyncio
async def test_exchange_google_code_rejects_missing_pkce_verifier(monkeypatch) -> None:
    state, _jti = google_oauth._encode_state("https://example.test/redirect_from_auth")
    google_oauth._metadata_cache = {
        "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_endpoint": "https://oauth2.googleapis.com/token",
        "userinfo_endpoint": "https://openidconnect.googleapis.com/v1/userinfo",
    }
    google_oauth._metadata_cached_at = google_oauth.time.monotonic()

    async def _missing_verifier(_state_jti: str) -> None:
        return None

    monkeypatch.setattr(google_oauth, "_consume_pkce_verifier", _missing_verifier)

    with pytest.raises(google_oauth.HTTPException) as exc_info:
        await google_oauth.exchange_google_code(
            client_id="client",
            client_secret="secret",
            code="code",
            redirect_uri="https://example.test/api/v1/auth/google/callback",
            state=state,
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Google OAuth session expired. Please try again."


@pytest.mark.asyncio
async def test_exchange_google_code_prefers_id_token_claims_when_present(
    monkeypatch,
) -> None:
    google_oauth._metadata_cache = {
        "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_endpoint": "https://oauth2.googleapis.com/token",
        "userinfo_endpoint": "https://openidconnect.googleapis.com/v1/userinfo",
    }
    google_oauth._metadata_cached_at = google_oauth.time.monotonic()

    id_token = pyjwt.encode(
        {
            "iss": "https://accounts.google.com",
            "aud": "client",
            "sub": "google-sub-123",
            "email": "user@example.com",
            "given_name": "Test",
            "family_name": "User",
            "picture": "https://example.test/avatar.png",
        },
        "unused",
        algorithm="HS256",
    )

    class _IdTokenClient:
        def __init__(self, *_args, **_kwargs) -> None:
            self.get_called = False

        async def __aenter__(self) -> Self:
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, _url: str, data: dict[str, str]) -> httpx.Response:
            return httpx.Response(
                200,
                json={"access_token": "token", "id_token": id_token},
                request=httpx.Request("POST", _url),
            )

        async def get(
            self, _url: str, headers: dict[str, str] | None = None
        ) -> httpx.Response:
            self.get_called = True
            return httpx.Response(
                200,
                json={"email": "should-not-be-used@example.com"},
                request=httpx.Request("GET", _url),
            )

    client = _IdTokenClient()
    monkeypatch.setattr(google_oauth, "_build_google_client", lambda timeout: client)

    userinfo = await google_oauth.exchange_google_code(
        client_id="client",
        client_secret="secret",
        code="code",
        redirect_uri="https://example.test/api/v1/auth/google/callback",
        state=None,
    )

    assert client.get_called is False
    assert userinfo["email"] == "user@example.com"
    assert userinfo["sub"] == "google-sub-123"
    assert userinfo["given_name"] == "Test"
    assert userinfo["frontend_callback"] == "/"


@pytest.mark.asyncio
async def test_exchange_google_code_falls_back_to_userinfo_without_id_token(
    monkeypatch,
) -> None:
    google_oauth._metadata_cache = {
        "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_endpoint": "https://oauth2.googleapis.com/token",
        "userinfo_endpoint": "https://openidconnect.googleapis.com/v1/userinfo",
    }
    google_oauth._metadata_cached_at = google_oauth.time.monotonic()

    class _FallbackClient:
        def __init__(self, *_args, **_kwargs) -> None:
            return None

        async def __aenter__(self) -> Self:
            return self

        async def __aexit__(self, exc_type, exc, tb) -> None:
            return None

        async def post(self, _url: str, data: dict[str, str]) -> httpx.Response:
            return httpx.Response(
                200,
                json={"access_token": "token"},
                request=httpx.Request("POST", _url),
            )

        async def get(
            self, _url: str, headers: dict[str, str] | None = None
        ) -> httpx.Response:
            return httpx.Response(
                200,
                json={"email": "user@example.com", "sub": "fallback-sub"},
                request=httpx.Request("GET", _url),
            )

    monkeypatch.setattr(
        google_oauth, "_build_google_client", lambda timeout: _FallbackClient()
    )

    userinfo = await google_oauth.exchange_google_code(
        client_id="client",
        client_secret="secret",
        code="code",
        redirect_uri="https://example.test/api/v1/auth/google/callback",
        state=None,
    )

    assert userinfo["email"] == "user@example.com"
    assert userinfo["sub"] == "fallback-sub"
