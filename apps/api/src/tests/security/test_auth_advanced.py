import asyncio
import base64
import json
import os
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import HTTPException
from joserfc import jwt

from src.security.auth import (
    ACCESS_TOKEN_EXPIRE,
    AUTH_TOKEN_AUDIENCE,
    AUTH_TOKEN_ISSUER,
    _decode_token_claims,
    _generate_jti,
    create_access_token,
    decode_access_token,
    decode_token_unverified,
    get_access_token_expiry_ms,
    get_current_user_from_token,
    is_jti_blocklisted,
    blocklist_jti,
)
from src.security.security import (
    generate_secure_password,
    security_hash_password,
    security_verify_password,
)
from src.security.keys import get_private_key, get_public_key, reload_key_cache
from config.config import reload_platform_config_cache
from src.db.users import User, PublicUser
from src.services.auth.sessions import SessionData

# ---------------------------------------------------------------------------
# Fixtures & Setup
# ---------------------------------------------------------------------------


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


@pytest.fixture
def mock_redis() -> AsyncMock:
    with patch("src.security.auth.get_async_redis_client") as mock_get_redis:
        mock_client = AsyncMock()
        mock_get_redis.return_value = mock_client
        yield mock_client


@pytest.fixture
def mock_db_session() -> MagicMock:
    return MagicMock()


# ---------------------------------------------------------------------------
# Test: Password Handling
# ---------------------------------------------------------------------------


class TestPasswordSecurity:
    def test_password_hashing_and_verification(self) -> None:
        """Test that passwords are correctly hashed and verified."""
        plain_password = "SecurePassword123!"
        hashed = security_hash_password(plain_password)

        # Invariants
        assert hashed != plain_password
        assert hashed.startswith("$argon2id$")

        # Valid verification
        assert security_verify_password(plain_password, hashed) is True

        # Invalid verification
        assert security_verify_password("WrongPassword!", hashed) is False

    def test_password_verification_none(self) -> None:
        """Test OAuth users with None passwords."""
        assert security_verify_password("AnyPassword", None) is False


# ---------------------------------------------------------------------------
# Test: Token Generation & Decoding
# ---------------------------------------------------------------------------


class TestAuthTokens:
    def test_token_claims_correctness(self) -> None:
        """Test that tokens contain correct JWT claims and embedded user info."""
        user_uuid = "user-1234-abcd"
        session_id = "sess-123"
        roles = ["admin", "student"]
        permissions = ["course:read:own", "system:admin:all"]
        user_claims = {"name": "Test User", "email": "test@example.com"}

        token = create_access_token(
            user_uuid=user_uuid,
            session_id=session_id,
            roles=roles,
            permissions=permissions,
            user_claims=user_claims,
            expires_delta=timedelta(minutes=15),
        )

        token_data = decode_access_token(token)

        assert token_data.user_uuid == user_uuid
        assert token_data.session_id == session_id
        assert token_data.roles == roles
        assert token_data.jti is not None
        assert token_data.issued_at is not None
        assert token_data.expires_at is not None
        assert token_data.roles_version is not None

        raw_claims = _decode_token_claims(token)
        assert raw_claims["perms"] == permissions
        assert raw_claims["u"] == user_claims

    def test_decode_token_expired(self) -> None:
        """Test that expired tokens are immediately rejected."""
        token = create_access_token(
            user_uuid="user-1", session_id="sess-1", expires_delta=timedelta(seconds=-1)
        )

        with pytest.raises(HTTPException) as exc_info:
            decode_access_token(token)

        assert exc_info.value.status_code == 401
        assert "Could not validate credentials" in exc_info.value.detail

    def test_tampered_token_signature(self) -> None:
        """Test that tampered tokens fail signature validation."""
        token = create_access_token(user_uuid="user-1", session_id="sess-1")

        # Tamper payload
        header, payload, sig = token.split(".")
        decoded_payload = json.loads(base64.urlsafe_b64decode(payload + "=="))
        decoded_payload["sub"] = "admin-uuid"  # Privilege escalation attempt
        tampered_payload = (
            base64
            .urlsafe_b64encode(json.dumps(decoded_payload).encode())
            .decode()
            .rstrip("=")
        )

        tampered_token = f"{header}.{tampered_payload}.{sig}"

        with pytest.raises(HTTPException) as exc_info:
            decode_access_token(tampered_token)

        assert exc_info.value.status_code == 401

    def test_unverified_token_decoding_for_refresh(self) -> None:
        """Test that decode_token_unverified works even on expired/tampered tokens."""
        token = create_access_token(
            user_uuid="user-1", session_id="sess-1", expires_delta=timedelta(seconds=-1)
        )
        # Should NOT raise an exception
        payload = decode_token_unverified(token)
        assert payload["sub"] == "user-1"
        assert payload["sid"] == "sess-1"
        assert payload["exp"] < int(datetime.now(UTC).timestamp())


# ---------------------------------------------------------------------------
# Test: Logout, Revocation & Blocklisting
# ---------------------------------------------------------------------------


class TestRevocationAndBlocklist:
    @pytest.mark.asyncio
    async def test_blocklist_jti(self, mock_redis: AsyncMock) -> None:
        """Test JTI blocklist adding logic."""
        jti = "mocked-jti-123"
        await blocklist_jti(jti, remaining_seconds=600)

        mock_redis.set.assert_called_once_with("jti:mocked-jti-123", "1", ex=600)

    @pytest.mark.asyncio
    async def test_is_jti_blocklisted_true(self, mock_redis: AsyncMock) -> None:
        """Test JTI blocklist verification logic."""
        mock_redis.exists.return_value = 1
        is_blocked = await is_jti_blocklisted("mocked-jti-123")
        assert is_blocked is True
        mock_redis.exists.assert_called_once_with("jti:mocked-jti-123")

    @pytest.mark.asyncio
    async def test_redis_failure_during_blocklist(self, mock_redis: AsyncMock) -> None:
        """Test system behavior when Redis is unreachable (fail-open vs fail-closed).

        Currently the logic defaults to False (fail-open) if Redis is None,
        but let's verify what happens if exists() raises an exception.
        """
        mock_redis.exists.side_effect = Exception("Redis connection lost")

        with pytest.raises(Exception, match="Redis connection lost"):
            await is_jti_blocklisted("mocked-jti-123")


# ---------------------------------------------------------------------------
# Test: Active Session Validation & Roles Staleness
# ---------------------------------------------------------------------------


class TestActiveSessionValidation:
    @pytest.mark.asyncio
    @patch("src.security.auth.get_session_by_id")
    @patch("src.security.auth._get_user_by_uuid")
    async def test_valid_user_request(
        self,
        mock_get_user: MagicMock,
        mock_get_session: AsyncMock,
        mock_redis: AsyncMock,
        mock_db_session: MagicMock,
    ) -> None:
        """Test full valid token extraction flow."""
        token = create_access_token(user_uuid="user-1", session_id="sess-1")
        mock_redis.exists.return_value = 0  # not blocklisted
        mock_redis.get.return_value = None  # roles not stale
        mock_get_session.return_value = SessionData(
            session_id="sess-1",
            token_family_id="fam-1",
            user_id=1,
            user_uuid="user-1",
            refresh_token_hash="hash",
            ip_address="",
            user_agent="",
            created_at=0,
            last_seen_at=0,
            rotated_count=0,
            absolute_expires_at=0,
        )

        mock_user = MagicMock(spec=User)
        mock_user.model_dump.return_value = {
            "id": 1,
            "user_uuid": "user-1",
            "username": "u1",
            "email": "u1@e.com",
            "first_name": "Test",
            "last_name": "User",
        }
        mock_get_user.return_value = mock_user

        # Create a mock request object
        request = MagicMock()

        user = await get_current_user_from_token(request, token, mock_db_session)
        assert user.user_uuid == "user-1"

    @pytest.mark.asyncio
    @patch("src.security.auth.get_session_by_id")
    async def test_session_mismatch(
        self,
        mock_get_session: AsyncMock,
        mock_redis: AsyncMock,
        mock_db_session: MagicMock,
    ) -> None:
        """Test rejection when token session does not match DB session (e.g., token stolen from old session)."""
        token = create_access_token(user_uuid="user-1", session_id="sess-1")
        mock_redis.exists.return_value = 0

        # Mismatched user_uuid
        mock_get_session.return_value = SessionData(
            session_id="sess-1",
            token_family_id="fam-1",
            user_id=2,
            user_uuid="different-user",
            refresh_token_hash="hash",
            ip_address="",
            user_agent="",
            created_at=0,
            last_seen_at=0,
            rotated_count=0,
            absolute_expires_at=0,
        )

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_from_token(MagicMock(), token, mock_db_session)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    @patch("src.security.auth.get_session_by_id")
    async def test_stale_roles_rejection(
        self,
        mock_get_session: AsyncMock,
        mock_redis: AsyncMock,
        mock_db_session: MagicMock,
    ) -> None:
        """Test rejection when user's roles have changed since token issuance."""
        # Token issued at time T
        token = create_access_token(user_uuid="user-1", session_id="sess-1")
        token_data = decode_access_token(token)

        # Simulating roles updated at T + 10
        mock_redis.exists.return_value = 0
        mock_redis.get.return_value = str(token_data.roles_version + 10).encode()

        mock_get_session.return_value = SessionData(
            session_id="sess-1",
            token_family_id="fam-1",
            user_id=1,
            user_uuid="user-1",
            refresh_token_hash="hash",
            ip_address="",
            user_agent="",
            created_at=0,
            last_seen_at=0,
            rotated_count=0,
            absolute_expires_at=0,
        )

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user_from_token(MagicMock(), token, mock_db_session)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Token roles stale — please refresh"
        assert (
            exc_info.value.headers.get("WWW-Authenticate")
            == 'Bearer error="roles_stale"'
        )
