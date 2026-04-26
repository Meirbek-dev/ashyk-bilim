from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from src.routers import auth as auth_router
from src.services.auth import google_oauth


def _build_request() -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/api/v1/auth/google/callback",
        "headers": [],
        "query_string": b"",
    })


@pytest.mark.asyncio
async def test_google_callback_redirects_to_frontend_on_exchange_error(
    monkeypatch,
) -> None:
    frontend_callback = "https://example.test/redirect_from_auth"
    state, _jti = google_oauth._encode_state(frontend_callback)

    async def _fail_exchange(**_kwargs):
        raise HTTPException(
            status_code=503, detail="Google OAuth service temporarily unavailable"
        )

    monkeypatch.setattr(auth_router, "exchange_google_code", _fail_exchange)

    response = await auth_router.google_callback(
        request=_build_request(),
        db_session=MagicMock(),
        user_manager=MagicMock(),
        code="code",
        state=state,
    )

    assert response.status_code == 307
    assert response.headers["Location"] == (
        "https://example.test/redirect_from_auth?error=google_auth_failed"
    )
