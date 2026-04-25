"""Authentication backend — JWT transport + strategy."""

from functools import lru_cache

from fastapi_users.authentication import (
    AuthenticationBackend,
    CookieTransport,
    JWTStrategy,
)

from config.config import get_settings
from src.security.auth_cookies import ACCESS_COOKIE_KEY
from src.security.auth_lifetimes import ACCESS_TOKEN_EXPIRE
from src.security.keys import get_jwt_secret


@lru_cache(maxsize=1)
def get_cookie_transport() -> CookieTransport:
    settings = get_settings()
    cookie_domain = settings.hosting_config.cookie_config.domain
    cookie_secure = settings.hosting_config.cookies_use_secure_transport()

    return CookieTransport(
        cookie_name=ACCESS_COOKIE_KEY,
        cookie_max_age=int(ACCESS_TOKEN_EXPIRE.total_seconds()),
        cookie_path="/",
        cookie_domain=cookie_domain,
        cookie_secure=cookie_secure,
        cookie_httponly=True,
        cookie_samesite="lax",
    )


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(
        secret=get_jwt_secret(),
        lifetime_seconds=int(ACCESS_TOKEN_EXPIRE.total_seconds()),
    )


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=get_cookie_transport(),
    get_strategy=get_jwt_strategy,
)
