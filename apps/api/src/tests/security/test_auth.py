import base64
import os
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock, patch

import pytest
from authlib.jose import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import HTTPException, Request, Response
from sqlmodel import Session

from config.config import reload_platform_config_cache
from src.db.users import AnonymousUser, User
from src.routers.auth import _compact_permissions_for_token, _sanitize_callback_target
from src.security.auth import (
    ACCESS_TOKEN_EXPIRE,
    AUTH_TOKEN_AUDIENCE,
    AUTH_TOKEN_ISSUER,
    create_access_token,
    decode_access_token,
    get_access_token_from_request,
    get_current_user_from_token,
    get_current_user_optional,
)
from src.security.auth_cookies import (
    ACCESS_COOKIE_TTL_SECONDS,
    set_access_cookie,
    set_refresh_cookie,
)
from src.security.keys import get_private_key, get_public_key, reload_key_cache
from src.services.auth.sessions import (
    SessionData,
    create_auth_session,
    hash_refresh_token,
    inspect_refresh_session,
)


@pytest.fixture(autouse=True)
def configure_test_signing_keys() -> None:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    os.environ["PLATFORM_AUTH_ED25519_PRIVATE_KEY"] = base64.b64encode(
        private_pem
    ).decode("utf-8")
    os.environ["PLATFORM_AUTH_ED25519_PUBLIC_KEY"] = base64.b64encode(
        public_pem
    ).decode("utf-8")
    reload_key_cache()
    reload_platform_config_cache()

    yield

    reload_key_cache()
    reload_platform_config_cache()


def _mock_user() -> Mock:
    user = Mock(spec=User)
    user.model_dump.return_value = {
        "id": 1,
        "user_uuid": "user_123",
        "username": "testuser",
        "first_name": "Test",
        "middle_name": "",
        "last_name": "User",
        "email": "test@example.com",
        "avatar_image": "",
        "bio": "",
        "details": {},
        "profile": {},
        "theme": "default",
        "locale": "ru-RU",
    }
    return user


class TestAuth:
    def test_create_access_token_contains_expected_claims(self) -> None:
        token = create_access_token(user_uuid="user_123", session_id="sess_123")
        claims = jwt.decode(
            token,
            get_public_key(),
            claims_options={
                "iss": {"essential": True, "value": AUTH_TOKEN_ISSUER},
                "aud": {"essential": True, "value": AUTH_TOKEN_AUDIENCE},
            },
        )
        claims.validate()
        payload = dict(claims)

        assert payload["sub"] == "user_123"
        assert payload["sid"] == "sess_123"
        assert payload["iss"] == AUTH_TOKEN_ISSUER
        assert payload["aud"] == AUTH_TOKEN_AUDIENCE
        assert payload["type"] == "access"

        expires_at = datetime.fromtimestamp(int(payload["exp"]), tz=UTC)
        issued_at = datetime.fromtimestamp(int(payload["iat"]), tz=UTC)
        assert expires_at - issued_at == ACCESS_TOKEN_EXPIRE

    def test_decode_access_token_rejects_wrong_audience(self) -> None:
        now = datetime.now(UTC)
        token = jwt.encode(
            {"alg": "EdDSA", "kid": "v1"},
            {
                "sub": "user_123",
                "sid": "sess_123",
                "jti": "jti_123",
                "iss": AUTH_TOKEN_ISSUER,
                "aud": "wrong-audience",
                "iat": int(now.timestamp()),
                "exp": int((now + ACCESS_TOKEN_EXPIRE).timestamp()),
                "type": "access",
            },
            get_private_key(),
        )
        encoded = token.decode("utf-8") if isinstance(token, bytes) else token

        with pytest.raises(HTTPException) as exc_info:
            decode_access_token(encoded)

        assert exc_info.value.status_code == 401

    def test_get_public_key_derives_from_private_key_when_public_missing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("PLATFORM_AUTH_ED25519_PUBLIC_KEY", raising=False)
        monkeypatch.setattr(
            "src.security.keys.get_settings",
            lambda: Mock(
                security_config=Mock(
                    auth_ed25519_private_key=None,
                    auth_ed25519_public_key=None,
                )
            ),
        )
        reload_key_cache()

        token = create_access_token(user_uuid="user_123", session_id="sess_123")
        token_data = decode_access_token(token)

        assert token_data.user_uuid == "user_123"
        assert token_data.session_id == "sess_123"

    def test_get_public_key_uses_settings_fallback(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        private_key = Ed25519PrivateKey.generate()
        public_key = private_key.public_key()

        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        public_pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )

        monkeypatch.delenv("PLATFORM_AUTH_ED25519_PRIVATE_KEY", raising=False)
        monkeypatch.delenv("PLATFORM_AUTH_ED25519_PUBLIC_KEY", raising=False)
        monkeypatch.setattr(
            "src.security.keys.get_settings",
            lambda: Mock(
                security_config=Mock(
                    auth_ed25519_private_key=base64.b64encode(private_pem).decode(
                        "utf-8"
                    ),
                    auth_ed25519_public_key=base64.b64encode(public_pem).decode(
                        "utf-8"
                    ),
                )
            ),
        )
        reload_key_cache()

        key = get_public_key()

        assert key is not None

    def test_get_access_token_from_request_prefers_header(self) -> None:
        request = Mock(spec=Request)
        request.cookies = {"access_token_cookie": "cookie-token"}

        assert get_access_token_from_request(request, "header-token") == "header-token"

    def test_get_access_token_from_request_uses_cookie(self) -> None:
        request = Mock(spec=Request)
        request.cookies = {"access_token_cookie": "cookie-token"}

        assert get_access_token_from_request(request, None) == "cookie-token"

    @pytest.mark.asyncio
    async def test_get_current_user_from_token_requires_active_session(self) -> None:
        token = create_access_token(user_uuid="user_123", session_id="sess_123")

        with (
            patch(
                "src.security.auth.get_session_by_id", new=AsyncMock(return_value=None)
            ),
            patch(
                "src.security.auth.is_jti_blocklisted",
                new=AsyncMock(return_value=False),
            ),
            pytest.raises(HTTPException) as exc_info,
        ):
            await get_current_user_from_token(
                Mock(spec=Request), token, Mock(spec=Session)
            )

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_user_from_token_returns_public_user(self) -> None:
        token = create_access_token(user_uuid="user_123", session_id="sess_123")
        active_session = SessionData(
            session_id="sess_123",
            token_family_id="fam_123",
            user_id=1,
            user_uuid="user_123",
            refresh_token_hash="hash",
            ip_address="127.0.0.1",
            user_agent="pytest",
            created_at=1,
            last_seen_at=1,
            rotated_count=0,
            absolute_expires_at=9999999999,
        )
        user = _mock_user()

        with (
            patch(
                "src.security.auth.get_session_by_id",
                new=AsyncMock(return_value=active_session),
            ),
            patch(
                "src.security.auth.is_jti_blocklisted",
                new=AsyncMock(return_value=False),
            ),
            patch(
                "src.security.auth._is_roles_stale",
                new=AsyncMock(return_value=False),
            ),
            patch("src.security.auth._get_user_by_uuid", return_value=user),
        ):
            result = await get_current_user_from_token(
                Mock(spec=Request), token, Mock(spec=Session)
            )

        assert result.user_uuid == "user_123"
        assert result.email == "test@example.com"

    @pytest.mark.asyncio
    async def test_get_current_user_optional_invalid_token_returns_anonymous(
        self,
    ) -> None:
        request = Mock(spec=Request)
        request.cookies = {}

        result = await get_current_user_optional(
            request=request, token="bad-token", db_session=Mock(spec=Session)
        )

        assert isinstance(result, AnonymousUser)


class TestRefreshSessionInspection:
    @pytest.mark.asyncio
    async def test_inspect_refresh_session_reports_reused_rotated_token(self) -> None:
        refresh_token = "sess_old.secret"
        record = Mock()
        record.refresh_token_hash = hash_refresh_token(refresh_token)
        record.expires_at = datetime.now(UTC) + timedelta(days=1)
        record.revoked_at = datetime.now(UTC)
        record.replaced_by_session_id = "sess_new"
        record.token_family_id = "fam_123"
        record.user_id = 10

        db_session = Mock(spec=Session)
        db_session.exec.return_value.first.return_value = record

        with patch(
            "src.services.auth.sessions._find_session_by_refresh_token",
            new=AsyncMock(return_value=None),
        ):
            inspection = await inspect_refresh_session(db_session, refresh_token)

        assert inspection.status == "reused"
        assert inspection.session_id == "sess_old"
        assert inspection.token_family_id == "fam_123"
        assert inspection.user_id == 10


class TestOAuthCallbackSanitization:
    def test_sanitize_callback_target_keeps_relative_paths(self) -> None:
        result = _sanitize_callback_target("/redirect_from_auth?foo=bar")

        assert result == "/redirect_from_auth?foo=bar"

    def test_sanitize_callback_target_keeps_trusted_absolute_origin(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv(
            "PLATFORM_ALLOWED_ORIGINS",
            "http://localhost:3000,http://localhost:3001",
        )
        reload_platform_config_cache()

        result = _sanitize_callback_target(
            "http://localhost:3000/redirect_from_auth?foo=bar#ignored"
        )

        assert result == "http://localhost:3000/redirect_from_auth?foo=bar"

    def test_sanitize_callback_target_rejects_untrusted_absolute_origin(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("PLATFORM_ALLOWED_ORIGINS", "http://localhost:3000")
        reload_platform_config_cache()

        with pytest.raises(HTTPException) as exc_info:
            _sanitize_callback_target("http://localhost:4000/redirect_from_auth")

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "Untrusted callback origin"


class TestAuthSessionRedisIndexRepair:
    @pytest.mark.asyncio
    async def test_create_auth_session_repairs_legacy_user_session_key(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        pipe = AsyncMock()
        pipe.__aenter__.return_value = pipe
        pipe.__aexit__.return_value = None
        pipe.set.return_value = None
        pipe.zadd.return_value = None
        pipe.zremrangebyscore.return_value = None
        pipe.expireat.return_value = None
        pipe.execute.return_value = [True, True, True, True]

        redis = Mock()
        redis.type = AsyncMock(side_effect=["string", "none"])
        redis.delete = AsyncMock(return_value=1)
        redis.zrangebyscore = AsyncMock(return_value=[])
        redis.pipeline.return_value = pipe

        user = Mock()
        user.id = 42
        user.user_uuid = "user_123"

        monkeypatch.setattr(
            "src.services.auth.sessions.get_async_redis_client",
            lambda: redis,
        )
        monkeypatch.setattr(
            "src.services.auth.sessions._fire_audit_create",
            lambda _data: None,
        )

        session_data, refresh_token = await create_auth_session(
            user=user,
            ip_address="127.0.0.1",
            user_agent="pytest",
        )

        assert session_data.user_id == 42
        assert refresh_token.startswith(session_data.session_id + ".")
        redis.delete.assert_awaited_once_with("user_sessions:42")
        redis.zrangebyscore.assert_awaited_once_with(
            "user_sessions:42", pytest.approx(session_data.created_at, abs=5), "+inf"
        )


class TestAuthCookies:
    def test_set_access_cookie_uses_root_path(self) -> None:
        response = Response()

        set_access_cookie(response, "access-token")

        cookie_header = response.headers["set-cookie"]
        assert "access_token_cookie=access-token" in cookie_header
        assert "Path=/" in cookie_header
        assert f"Max-Age={ACCESS_COOKIE_TTL_SECONDS}" in cookie_header

    def test_set_refresh_cookie_keeps_refresh_path(self) -> None:
        response = Response()

        set_refresh_cookie(response, "refresh-token")

        cookie_header = response.headers["set-cookie"]
        assert "refresh_token_cookie=refresh-token" in cookie_header
        assert "Path=/api/auth/refresh" in cookie_header

    def test_cookie_secure_override_disables_secure_attribute(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("PLATFORM_SSL", "true")
        monkeypatch.setenv("PLATFORM_COOKIE_SECURE", "false")
        reload_platform_config_cache()

        access_response = Response()
        refresh_response = Response()

        set_access_cookie(access_response, "access-token")
        set_refresh_cookie(refresh_response, "refresh-token")

        assert "Secure" not in access_response.headers["set-cookie"]
        assert "Secure" not in refresh_response.headers["set-cookie"]


class TestTokenPermissionCompaction:
    def test_admin_permissions_are_compacted_for_token(self) -> None:
        result = _compact_permissions_for_token(
            ["admin", "user"],
            ["course:read:all", "platform:update:all"],
        )

        assert result == ["*"]

    def test_non_admin_permissions_are_preserved_for_token(self) -> None:
        permissions = ["course:read:all", "platform:update:assigned"]

        result = _compact_permissions_for_token(["maintainer"], permissions)

        assert result == permissions
