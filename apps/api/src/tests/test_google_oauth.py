import uuid

import pytest
from fastapi import HTTPException
from fastapi_users.jwt import generate_jwt

from src.security.keys import get_jwt_secret, reload_key_cache
from src.services.auth.google_oauth import (
    PKCE_TTL,
    _GOOGLE_STATE_AUDIENCE,
    _decode_state,
    _encode_state,
    get_frontend_callback_from_state,
)


@pytest.fixture(autouse=True)
def clear_jwt_secret_cache() -> None:
    reload_key_cache()


def test_google_state_round_trip() -> None:
    callback = "/auth/finish"

    state, state_jti = _encode_state(callback)

    decoded_callback, decoded_jti = _decode_state(state)

    assert decoded_callback == callback
    assert decoded_jti == state_jti
    assert get_frontend_callback_from_state(state) == callback


def test_google_state_rejects_invalid_signature() -> None:
    state, _state_jti = _encode_state("/auth/finish")
    tampered_state = f"{state}broken"

    with pytest.raises(HTTPException, match="Invalid OAuth state"):
        _decode_state(tampered_state)


def test_google_state_rejects_expired_token() -> None:
    expired_state = generate_jwt(
        {
            "aud": _GOOGLE_STATE_AUDIENCE,
            "callback": "/auth/finish",
            "type": "google_state",
            "jti": str(uuid.uuid4()),
        },
        get_jwt_secret(),
        lifetime_seconds=-PKCE_TTL,
    )

    with pytest.raises(HTTPException, match="OAuth state expired"):
        _decode_state(expired_state)
