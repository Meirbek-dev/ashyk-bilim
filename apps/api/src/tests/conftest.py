import os
import pathlib
import sys

# Ensure src/ is on the Python path for all tests
sys.path.insert(
    0, pathlib.Path(os.path.join(pathlib.Path(__file__).parent, "../..")).resolve()
)

# Provide an explicit settings baseline so tests do not rely on a local backend .env file.
os.environ["PLATFORM_DOMAIN"] = "example.test"
os.environ["PLATFORM_ALLOWED_REGEXP"] = r"^https?://example\.test(:\d+)?$"
os.environ["PLATFORM_SQL_CONNECTION_STRING"] = "sqlite://"
os.environ["PLATFORM_REDIS_CONNECTION_STRING"] = "redis://localhost:6379/0"
os.environ["PLATFORM_JWT_SECRET"] = "test-secret-at-least-32-bytes-long-for-hmac"

# Suppress logfire warnings in tests
os.environ["LOGFIRE_IGNORE_NO_CONFIG"] = "1"


import pytest

from src.security.rbac import PermissionChecker


@pytest.fixture(autouse=True)
def mock_permission_checker(monkeypatch: pytest.MonkeyPatch):
    """Stub out permission checks globally for integration tests."""
    monkeypatch.setattr(PermissionChecker, "check", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(PermissionChecker, "require", lambda *_args, **_kwargs: None)
