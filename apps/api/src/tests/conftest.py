import base64
import os
import sys

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

# Ensure src/ is on the Python path for all tests
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))  # noqa: E402

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
_test_private_key = Ed25519PrivateKey.generate()
_test_public_key = _test_private_key.public_key()
_test_private_pem = _test_private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
)
_test_public_pem = _test_public_key.public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
)

os.environ.setdefault(
    "PLATFORM_AUTH_ED25519_PRIVATE_KEY",
    base64.b64encode(_test_private_pem).decode("utf-8"),
)
os.environ.setdefault(
    "PLATFORM_AUTH_ED25519_PUBLIC_KEY",
    base64.b64encode(_test_public_pem).decode("utf-8"),
)

# Suppress logfire warnings in tests
os.environ["LOGFIRE_IGNORE_NO_CONFIG"] = "1"
