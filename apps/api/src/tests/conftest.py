import os
import sys

# Ensure src/ is on the Python path for all tests
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

# Provide an explicit settings baseline so tests do not rely on a local backend .env file.
os.environ.setdefault("PLATFORM_DOMAIN", "example.test")
os.environ.setdefault("PLATFORM_ALLOWED_REGEXP", r"^https?://example\.test(:\d+)?$")
os.environ.setdefault(
    "PLATFORM_SQL_CONNECTION_STRING",
    "sqlite://",  # build_engine() detects sqlite:// prefix → in-memory StaticPool
)
os.environ.setdefault(
    "PLATFORM_REDIS_CONNECTION_STRING",
    "redis://localhost:6379/0",
)
os.environ.setdefault(
    "PLATFORM_JWT_SECRET",
    "test-secret-at-least-32-bytes-long-for-hmac",
)

# Suppress logfire warnings in tests
os.environ["LOGFIRE_IGNORE_NO_CONFIG"] = "1"
