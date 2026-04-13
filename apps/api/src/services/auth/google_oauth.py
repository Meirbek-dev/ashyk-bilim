import base64
import hashlib
import secrets
from functools import lru_cache
from typing import Any

import httpx
from authlib.integrations.httpx_client import AsyncOAuth2Client
from authlib.jose import JoseError, jwt
from fastapi import HTTPException

from src.security.keys import get_private_key, get_public_key
from src.services.cache.redis_client import get_redis_client

GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
PKCE_TTL = 600  # 10 minutes


async def _get_google_metadata() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(GOOGLE_DISCOVERY_URL)
        response.raise_for_status()
        return response.json()


# ── State JWT (carries frontend callback URL through OAuth round-trip) ────────


def _encode_state(callback: str) -> str:
    import uuid

    payload = {
        "callback": callback,
        "type": "google_state",
        "jti": str(uuid.uuid4()),
        "exp": int(__import__("time").time()) + 600,
    }
    token = jwt.encode({"alg": "EdDSA"}, payload, get_private_key())
    return token.decode("utf-8") if isinstance(token, bytes) else token


def _decode_state(state: str) -> tuple[str, str]:
    """Return (callback_url, state_jti)."""
    try:
        claims = jwt.decode(state, get_public_key())
        claims.validate()
        payload = dict(claims)
        callback = payload.get("callback")
        jti = payload.get("jti")
        if (
            payload.get("type") != "google_state"
            or not isinstance(callback, str)
            or not callback
        ):
            raise HTTPException(status_code=400, detail="Invalid OAuth state")
        return callback, jti or ""
    except JoseError as exc:
        raise HTTPException(status_code=400, detail="Invalid OAuth state") from exc


# ── PKCE helpers ──────────────────────────────────────────────────────────────


def _generate_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge)."""
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge


def _store_pkce_verifier(state_jti: str, code_verifier: str) -> None:
    r = get_redis_client()
    if r:
        r.set(f"pkce:{state_jti}", code_verifier, ex=PKCE_TTL)


def _consume_pkce_verifier(state_jti: str) -> str | None:
    r = get_redis_client()
    if not r:
        return None
    key = f"pkce:{state_jti}"
    verifier = r.get(key)
    r.delete(key)
    if isinstance(verifier, bytes):
        return verifier.decode()
    return verifier


# ── Public API ────────────────────────────────────────────────────────────────


def get_google_authorize_url(
    client_id: str,
    redirect_uri: str,
    callback: str,
) -> str:
    state = _encode_state(callback)
    _, state_jti = _decode_state(state)  # extract jti to store pkce
    code_verifier, code_challenge = _generate_pkce()
    _store_pkce_verifier(state_jti, code_verifier)

    metadata = httpx.get(GOOGLE_DISCOVERY_URL, timeout=10.0).json()
    client = AsyncOAuth2Client(
        client_id=client_id,
        redirect_uri=redirect_uri,
        scope="openid email profile",
    )
    url, _ = client.create_authorization_url(
        metadata["authorization_endpoint"],
        state=state,
        code_challenge=code_challenge,
        code_challenge_method="S256",
        access_type="online",
        prompt="select_account",
    )
    return url


async def exchange_google_code(
    client_id: str,
    client_secret: str,
    code: str,
    redirect_uri: str,
    state: str | None = None,
) -> dict[str, Any]:
    metadata = await _get_google_metadata()
    code_verifier: str | None = None
    frontend_callback = "/"

    if state:
        frontend_callback, state_jti = _decode_state(state)
        code_verifier = _consume_pkce_verifier(state_jti)

    async with AsyncOAuth2Client(
        client_id=client_id,
        client_secret=client_secret,
        redirect_uri=redirect_uri,
        scope="openid email profile",
    ) as client:
        try:
            fetch_kwargs: dict[str, Any] = {
                "url": metadata["token_endpoint"],
                "code": code,
                "grant_type": "authorization_code",
            }
            if code_verifier:
                fetch_kwargs["code_verifier"] = code_verifier
            token = await client.fetch_token(**fetch_kwargs)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail="Failed to exchange Google authorization code",
            ) from exc

        access_token = token.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise HTTPException(
                status_code=400,
                detail="Google token response missing access_token",
            )

        userinfo_resp = await client.get(metadata["userinfo_endpoint"])
        if userinfo_resp.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail="Failed to fetch Google user info",
            )

        userinfo = userinfo_resp.json()
        userinfo["frontend_callback"] = frontend_callback
        return userinfo
