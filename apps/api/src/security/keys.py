"""JWT secret key management.

The JWT secret is loaded from PLATFORM_JWT_SECRET.  It is used for HMAC-SHA256
signing of all tokens (access, refresh-state, OAuth state, password-reset).

Generate a suitable secret once:
    python -c "import secrets; print(secrets.token_hex(64))"
"""

from functools import lru_cache

from config.config import get_settings, secret_value


@lru_cache(maxsize=1)
def get_jwt_secret() -> str:
    value = secret_value(get_settings().security_config.jwt_secret)
    if value is None:
        msg = "PLATFORM_JWT_SECRET must be set"
        raise RuntimeError(msg)
    return value


def reload_key_cache() -> None:
    """Clear cached secret (for testing / key rotation)."""
    get_jwt_secret.cache_clear()
