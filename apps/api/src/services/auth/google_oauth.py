import asyncio
import base64
import hashlib
import logging
import secrets
import time
import uuid
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt as pyjwt
from fastapi import HTTPException

from src.security.keys import get_jwt_secret
from src.services.cache.redis_client import get_async_redis_client

logger = logging.getLogger(__name__)

GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
PKCE_TTL = 600  # 10 minutes
_METADATA_CACHE_TTL = 3600
_DISCOVERY_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
_TOKEN_TIMEOUT = httpx.Timeout(connect=10.0, read=30.0, write=30.0, pool=10.0)
_USERINFO_TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=15.0, pool=5.0)
_RETRYABLE_HTTP_ERRORS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ProxyError,
    httpx.ReadError,
    httpx.ReadTimeout,
    httpx.RemoteProtocolError,
    httpx.WriteError,
    httpx.WriteTimeout,
)
_TOKEN_REQUEST_ATTEMPTS = 3
_GOOGLE_ISSUERS = {"https://accounts.google.com", "accounts.google.com"}
_REQUIRED_METADATA_KEYS = (
    "authorization_endpoint",
    "token_endpoint",
    "userinfo_endpoint",
)
_GOOGLE_METADATA_FALLBACK: dict[str, str] = {
    "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
    "token_endpoint": "https://oauth2.googleapis.com/token",
    "userinfo_endpoint": "https://openidconnect.googleapis.com/v1/userinfo",
}

_metadata_cache: dict[str, Any] = {}
_metadata_cached_at: float = 0.0


def _build_google_client(timeout: httpx.Timeout) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout)


def _validate_google_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    missing = [
        key for key in _REQUIRED_METADATA_KEYS if not isinstance(metadata.get(key), str)
    ]
    if missing:
        raise ValueError(
            f"Google discovery metadata missing required keys: {', '.join(missing)}"
        )
    return metadata


def _claims_from_google_id_token(
    id_token: str | None,
    *,
    client_id: str,
) -> dict[str, Any] | None:
    if not id_token:
        return None

    try:
        claims = pyjwt.decode(
            id_token,
            options={
                "verify_signature": False,
                "verify_aud": False,
                "verify_exp": False,
                "verify_iat": False,
                "verify_nbf": False,
            },
            algorithms=["RS256", "HS256", "ES256"],
        )
    except pyjwt.PyJWTError as exc:
        logger.warning("Failed to decode Google id_token", exc_info=exc)
        return None

    issuer = claims.get("iss")
    audience = claims.get("aud")
    subject = claims.get("sub")
    email = claims.get("email")

    if issuer not in _GOOGLE_ISSUERS:
        logger.warning("Ignoring Google id_token with unexpected issuer: %s", issuer)
        return None
    if audience != client_id:
        logger.warning("Ignoring Google id_token with unexpected audience")
        return None
    if not isinstance(subject, str) or not subject:
        logger.warning("Ignoring Google id_token without subject")
        return None
    if not isinstance(email, str) or not email:
        logger.warning("Ignoring Google id_token without email")
        return None

    return claims


async def _get_google_metadata() -> dict[str, Any]:
    global _metadata_cache, _metadata_cached_at
    if _metadata_cache and time.monotonic() - _metadata_cached_at < _METADATA_CACHE_TTL:
        return _metadata_cache

    try:
        async with _build_google_client(_DISCOVERY_TIMEOUT) as client:
            response = await client.get(GOOGLE_DISCOVERY_URL)
            response.raise_for_status()
            metadata = _validate_google_metadata(response.json())
    except (httpx.HTTPError, ValueError) as exc:
        if _metadata_cache:
            logger.warning(
                "Google discovery fetch failed; using stale cached metadata",
                exc_info=exc,
            )
            return _metadata_cache
        logger.warning(
            "Google discovery fetch failed; using built-in Google OAuth endpoints",
            exc_info=exc,
        )
        return dict(_GOOGLE_METADATA_FALLBACK)

    _metadata_cache = metadata
    _metadata_cached_at = time.monotonic()
    return _metadata_cache


# ── State JWT (carries frontend callback URL through OAuth round-trip) ────────


def _encode_state(callback: str) -> tuple[str, str]:
    """Return (state_token, jti)."""
    jti = str(uuid.uuid4())
    payload = {
        "callback": callback,
        "type": "google_state",
        "jti": jti,
        "exp": int(time.time()) + 600,
        "iat": int(time.time()),
    }
    token = pyjwt.encode(payload, get_jwt_secret(), algorithm="HS256")
    return token, jti


def _decode_state(state: str) -> tuple[str, str]:
    """Return (callback_url, state_jti)."""
    try:
        payload = pyjwt.decode(
            state,
            get_jwt_secret(),
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except pyjwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=400, detail="OAuth state expired") from exc
    except pyjwt.PyJWTError as exc:
        raise HTTPException(status_code=400, detail="Invalid OAuth state") from exc

    if payload.get("type") != "google_state":
        raise HTTPException(status_code=400, detail="Invalid OAuth state type")
    callback = payload.get("callback")
    jti = payload.get("jti")
    if not isinstance(callback, str) or not callback:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    return callback, jti or ""


# ── PKCE helpers ──────────────────────────────────────────────────────────────


def _generate_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge)."""
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge


async def _store_pkce_verifier(state_jti: str, code_verifier: str) -> None:
    r = get_async_redis_client()
    if r:
        await r.set(f"pkce:{state_jti}", code_verifier, ex=PKCE_TTL)


async def _consume_pkce_verifier(state_jti: str) -> str | None:
    r = get_async_redis_client()
    if not r:
        return None
    key = f"pkce:{state_jti}"
    verifier = await r.get(key)
    await r.delete(key)
    if isinstance(verifier, bytes):
        return verifier.decode()
    return verifier


def get_frontend_callback_from_state(state: str | None) -> str | None:
    if not state:
        return None
    callback, _state_jti = _decode_state(state)
    return callback


async def _post_google_token(
    client: httpx.AsyncClient,
    token_endpoint: str,
    token_data: dict[str, Any],
    *,
    redirect_uri: str,
    code_verifier_present: bool,
) -> httpx.Response:
    last_exc: httpx.HTTPError | None = None
    for attempt in range(1, _TOKEN_REQUEST_ATTEMPTS + 1):
        try:
            response = await client.post(token_endpoint, data=token_data)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError:
            raise
        except _RETRYABLE_HTTP_ERRORS as exc:
            last_exc = exc
            if attempt >= _TOKEN_REQUEST_ATTEMPTS:
                break
            logger.warning(
                "Google token exchange transient network error; retrying | endpoint=%s | redirect_uri=%s | pkce=%s | attempt=%s/%s | error_type=%s",
                token_endpoint,
                redirect_uri,
                "yes" if code_verifier_present else "no",
                attempt,
                _TOKEN_REQUEST_ATTEMPTS,
                type(exc).__name__,
            )
            await asyncio.sleep(0.5 * attempt)
    assert last_exc is not None
    raise last_exc


async def _get_google_userinfo(
    client: httpx.AsyncClient,
    userinfo_endpoint: str,
    access_token: str,
) -> dict[str, Any]:
    try:
        response = await client.get(
            userinfo_endpoint,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    except _RETRYABLE_HTTP_ERRORS as exc:
        logger.error(
            "Google userinfo network error | endpoint=%s | error_type=%s",
            userinfo_endpoint,
            type(exc).__name__,
            exc_info=exc,
        )
        raise HTTPException(
            status_code=503,
            detail="Google OAuth service temporarily unavailable",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=400,
            detail="Failed to fetch Google user info",
        )
    return response.json()


# ── Public API ────────────────────────────────────────────────────────────────


async def get_google_authorize_url(
    client_id: str,
    redirect_uri: str,
    callback: str,
) -> str:
    state, state_jti = _encode_state(callback)
    code_verifier, code_challenge = _generate_pkce()
    await _store_pkce_verifier(state_jti, code_verifier)

    metadata = await _get_google_metadata()

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "access_type": "online",
        "prompt": "select_account",
    }
    return metadata["authorization_endpoint"] + "?" + urlencode(params)


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
        code_verifier = await _consume_pkce_verifier(state_jti)
        if not code_verifier:
            logger.warning(
                "Missing Google PKCE verifier for callback | state_jti=%s | redirect_uri=%s",
                state_jti,
                redirect_uri,
            )
            raise HTTPException(
                status_code=400,
                detail="Google OAuth session expired. Please try again.",
            )

    async with _build_google_client(_TOKEN_TIMEOUT) as client:
        token_data: dict[str, Any] = {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
        if code_verifier:
            token_data["code_verifier"] = code_verifier

        try:
            token_resp = await _post_google_token(
                client,
                metadata["token_endpoint"],
                token_data,
                redirect_uri=redirect_uri,
                code_verifier_present=code_verifier is not None,
            )
        except httpx.HTTPStatusError as exc:
            # Log Google's actual error body so we can diagnose the root cause.
            try:
                google_error = exc.response.json()
            except ValueError:
                google_error = exc.response.text
            logger.error(
                "Google token exchange failed: HTTP %s | redirect_uri=%s | pkce=%s | error=%s",
                exc.response.status_code,
                redirect_uri,
                "yes" if code_verifier else "no",
                google_error,
            )
            raise HTTPException(
                status_code=400,
                detail="Failed to exchange Google authorization code",
            ) from exc
        except httpx.HTTPError as exc:
            logger.error(
                "Google token exchange network error | endpoint=%s | redirect_uri=%s | pkce=%s | error_type=%s",
                metadata["token_endpoint"],
                redirect_uri,
                "yes" if code_verifier else "no",
                type(exc).__name__,
                exc_info=exc,
            )
            raise HTTPException(
                status_code=503,
                detail="Google OAuth service temporarily unavailable",
            ) from exc

        token = token_resp.json()
        access_token = token.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise HTTPException(
                status_code=400,
                detail="Google token response missing access_token",
            )
        id_token_claims = _claims_from_google_id_token(
            token.get("id_token"),
            client_id=client_id,
        )

    if id_token_claims is not None:
        id_token_claims["frontend_callback"] = frontend_callback
        return id_token_claims

    async with _build_google_client(_USERINFO_TIMEOUT) as userinfo_client:
        userinfo = await _get_google_userinfo(
            userinfo_client,
            metadata["userinfo_endpoint"],
            access_token,
        )
        userinfo["frontend_callback"] = frontend_callback
        return userinfo
