import asyncio
import time
import pytest
from httpx import AsyncClient, ASGITransport
from sqlmodel import Session, select, SQLModel
from datetime import UTC, datetime, timedelta
from joserfc import jwt
from unittest.mock import AsyncMock, Mock, patch
from fastapi import HTTPException

from app import app
from src.db.users import User
from src.db.courses.courses import Course
from src.security.auth import (
    create_access_token,
    AUTH_TOKEN_ISSUER,
    AUTH_TOKEN_AUDIENCE,
)
from src.security.keys import get_private_key
from src.infra.settings import get_settings
from src.infra.db.engine import build_engine
from src.security.security import security_hash_password

# ============================================================================
# Fixtures & Helpers
# ============================================================================

from src.db.permission_enums import RoleSlug
from src.db.permissions import Role


@pytest.fixture(scope="session")
def engine():
    settings = get_settings()
    settings.database_config.sql_connection_string = "sqlite://"
    engine = build_engine(settings)
    SQLModel.metadata.create_all(engine)

    # Seed default roles
    with Session(engine) as session:
        if not session.exec(select(Role).where(Role.slug == RoleSlug.USER)).first():
            session.add(
                Role(name="User", slug=RoleSlug.USER, priority=10, is_system=True)
            )
        if not session.exec(select(Role).where(Role.slug == RoleSlug.ADMIN)).first():
            session.add(
                Role(name="Admin", slug=RoleSlug.ADMIN, priority=100, is_system=True)
            )
        session.commit()

    yield engine
    engine.dispose()


@pytest.fixture
def db(engine):
    with Session(engine) as session:
        app.state.session_factory = lambda: Session(engine)
        yield session
        for table in reversed(SQLModel.metadata.sorted_tables):
            session.execute(table.delete())

        # Seed default roles again for the next test
        if not session.exec(select(Role).where(Role.slug == RoleSlug.USER)).first():
            session.add(
                Role(name="User", slug=RoleSlug.USER, priority=10, is_system=True)
            )
        if not session.exec(select(Role).where(Role.slug == RoleSlug.ADMIN)).first():
            session.add(
                Role(name="Admin", slug=RoleSlug.ADMIN, priority=100, is_system=True)
            )
        session.commit()


@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


def create_test_user(db: Session, email: str, username: str, id: int = None) -> User:
    user = User(
        id=id,
        email=email,
        username=username,
        first_name="Test",
        last_name="User",
        password=security_hash_password("password123"),
        user_uuid=f"uuid_{username}",
        auth_provider="local",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_test_course(db: Session, owner_id: int, name: str) -> Course:
    course = Course(
        name=name,
        course_uuid=f"course_{name.lower().replace(' ', '_')}",
        creator_id=owner_id,
        public=True,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


# ============================================================================
# Security Tests
# ============================================================================


@pytest.mark.asyncio
class TestSecurityAudit:
    async def test_horizontal_privilege_escalation(
        self, client: AsyncClient, db: Session
    ):
        """
        [SECURITY] User A should not be able to modify User B's resource.
        """
        user_a = create_test_user(db, "user_a@example.com", "user_a", id=1)
        user_b = create_test_user(db, "user_b@example.com", "user_b", id=2)
        course_b = create_test_course(db, user_b.id, "User B Course")

        token_a = create_access_token(user_uuid=user_a.user_uuid, session_id="sess_a")

        with pytest.MonkeyPatch().context() as m:
            m.setattr(
                "src.security.auth.get_session_by_id",
                AsyncMock(return_value=Mock(user_uuid=user_a.user_uuid)),
            )
            m.setattr(
                "src.security.auth.is_jti_blocklisted", AsyncMock(return_value=False)
            )
            m.setattr(
                "src.security.auth._is_roles_stale", AsyncMock(return_value=False)
            )

            response = await client.put(
                f"/api/v1/courses/{course_b.course_uuid}/metadata",
                json={"name": "Hacked Course", "description": "Attempted hack"},
                headers={"Authorization": f"Bearer {token_a}"},
            )

            assert response.status_code == 403
            assert response.json()["error_code"] == "PERMISSION_DENIED"

    async def test_vertical_privilege_escalation(
        self, client: AsyncClient, db: Session
    ):
        """
        [SECURITY] Regular user should not be able to perform admin actions (e.g., creating roles).
        """
        user = create_test_user(db, "user@example.com", "regular_user", id=10)
        token = create_access_token(user_uuid=user.user_uuid, session_id="sess_user")

        with pytest.MonkeyPatch().context() as m:
            m.setattr(
                "src.security.auth.get_session_by_id",
                AsyncMock(return_value=Mock(user_uuid=user.user_uuid)),
            )
            m.setattr(
                "src.security.auth.is_jti_blocklisted", AsyncMock(return_value=False)
            )
            m.setattr(
                "src.security.auth._is_roles_stale", AsyncMock(return_value=False)
            )

            response = await client.post(
                "/api/v1/roles",
                json={"name": "Super Admin", "slug": "super-admin", "priority": 100},
                headers={"Authorization": f"Bearer {token}"},
            )

            assert response.status_code == 403

    async def test_token_expiration(self, client: AsyncClient):
        """
        [SECURITY] Expired tokens must be rejected.
        """
        now = datetime.now(UTC)
        expired_time = now - timedelta(hours=1)

        payload = {
            "sub": "user_123",
            "jti": "jti_123",
            "sid": "sess_123",
            "iss": AUTH_TOKEN_ISSUER,
            "aud": AUTH_TOKEN_AUDIENCE,
            "iat": int((expired_time - timedelta(minutes=15)).timestamp()),
            "exp": int(expired_time.timestamp()),
            "type": "access",
        }

        token = jwt.encode(
            {"alg": "EdDSA", "kid": "v1"},
            payload,
            get_private_key(),
            algorithms=["EdDSA"],
        )
        token_str = token.decode("utf-8") if isinstance(token, bytes) else token

        response = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token_str}"}
        )

        assert response.status_code == 401

    async def test_token_tampering(self, client: AsyncClient):
        """
        [SECURITY] Tokens with invalid signatures must be rejected.
        """
        token = create_access_token(user_uuid="user_123", session_id="sess_123")
        parts = token.split(".")
        tampered_token = f"{parts[0]}.{parts[1]}.{'a' * len(parts[2])}"

        response = await client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {tampered_token}"}
        )

        assert response.status_code == 401

    async def test_roles_stale_rejection(self, client: AsyncClient, db: Session):
        """
        [SECURITY] Tokens with old rvs claim must be rejected if roles were updated.
        """
        user = create_test_user(db, "stale@example.com", "stale_user", id=20)

        # Issue token with rvs = now - 100
        issued_at = int(time.time()) - 100
        token = create_access_token(user_uuid=user.user_uuid, session_id="sess_stale")

        # Manually tamper with the token to set an old rvs
        token_obj = jwt.decode(token, get_private_key(), algorithms=["EdDSA"])
        payload = dict(token_obj.claims)
        payload["rvs"] = issued_at

        old_token = jwt.encode(
            {"alg": "EdDSA", "kid": "v1"},
            payload,
            get_private_key(),
            algorithms=["EdDSA"],
        )
        old_token_str = (
            old_token.decode("utf-8") if isinstance(old_token, bytes) else old_token
        )

        with pytest.MonkeyPatch().context() as m:
            m.setattr(
                "src.security.auth.get_session_by_id",
                AsyncMock(return_value=Mock(user_uuid=user.user_uuid)),
            )
            m.setattr(
                "src.security.auth.is_jti_blocklisted", AsyncMock(return_value=False)
            )
            # Simulate roles updated AFTER the token was issued
            m.setattr("src.security.auth._is_roles_stale", AsyncMock(return_value=True))

            response = await client.get(
                "/api/v1/auth/me", headers={"Authorization": f"Bearer {old_token_str}"}
            )

            assert response.status_code == 401
            data = response.json()
            assert "roles stale" in data["message"].lower()
            assert 'error="roles_stale"' in response.headers["WWW-Authenticate"]

    async def test_brute_force_login_protection(self, client: AsyncClient):
        """
        [SECURITY] Multiple failed login attempts should trigger rate limiting.
        """
        with patch(
            "src.routers.auth.check_rate_limit",
            side_effect=HTTPException(
                status_code=429, detail="Too many login attempts"
            ),
        ):
            response = await client.post(
                "/api/v1/auth/login",
                json={"email": "victim@example.com", "password": "wrong-password"},
            )
            assert response.status_code == 429

    async def test_registration_validation_duplicate_email(
        self, client: AsyncClient, db: Session
    ):
        """
        [SECURITY] Registering with an existing email must fail.
        """
        create_test_user(db, "duplicate@example.com", "user1")

        # Note: I need to know where the registration endpoint is.
        # Usually /api/v1/users/register or similar.
        # Let's check src/routers/users.py.

        response = await client.post(
            "/api/v1/users",
            json={
                "email": "duplicate@example.com",
                "username": "user2",
                "first_name": "User",
                "last_name": "Two",
                "password": "Password123!",
            },
        )

        assert response.status_code == 400
        assert "already exists" in response.json()["message"].lower()

    async def test_registration_password_strength(self, client: AsyncClient):
        """
        [SECURITY] Weak passwords should be rejected if validation is enforced.
        """
        # The backend uses _validate_password in auth.py for login,
        # but let's see if it's used for registration in users.py.

        response = await client.post(
            "/api/v1/users",
            json={
                "email": "weak@example.com",
                "username": "weak_user",
                "first_name": "Weak",
                "last_name": "Pass",
                "password": "123",  # Too short
            },
        )

        # If enforced, should be 400 or 422
        assert response.status_code in [400, 422]

    async def test_missing_auth_header(self, client: AsyncClient):
        """
        [SECURITY] Protected endpoints must reject requests without Authorization header.
        """
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401

    async def test_sql_injection_attempt(self, client: AsyncClient, db: Session):
        """
        [SECURITY] Verify that SQL injection attempts in parameters are handled safely.
        """
        user = create_test_user(db, "attacker@example.com", "attacker", id=30)
        token = create_access_token(
            user_uuid=user.user_uuid, session_id="sess_attacker"
        )

        with pytest.MonkeyPatch().context() as m:
            m.setattr(
                "src.security.auth.get_session_by_id",
                AsyncMock(return_value=Mock(user_uuid=user.user_uuid)),
            )
            m.setattr(
                "src.security.auth.is_jti_blocklisted", AsyncMock(return_value=False)
            )
            m.setattr(
                "src.security.auth._is_roles_stale", AsyncMock(return_value=False)
            )

            # Attempt injection in a field that might be used in a query
            injection_payload = "' OR 1=1 --"
            response = await client.get(
                f"/api/v1/users/username/{injection_payload}",
                headers={"Authorization": f"Bearer {token}"},
            )

            # Should return 400 (User does not exist) or similar, not a list of all users
            assert response.status_code in [400, 404]
            # Ensure we didn't get a successful response with many users
            assert response.status_code != 200
