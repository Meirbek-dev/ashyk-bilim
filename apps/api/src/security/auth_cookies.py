from fastapi import Response

from config.config import get_settings
from src.security.auth_lifetimes import ACCESS_TOKEN_EXPIRE, REFRESH_TOKEN_EXPIRE

ACCESS_COOKIE_KEY = "access_token_cookie"
REFRESH_COOKIE_KEY = "refresh_token_cookie"
ACCESS_COOKIE_TTL_SECONDS = int(ACCESS_TOKEN_EXPIRE.total_seconds())
REFRESH_COOKIE_TTL_SECONDS = int(REFRESH_TOKEN_EXPIRE.total_seconds())


def set_access_cookie(response: Response, value: str) -> None:
    settings = get_settings()
    cookie_domain = settings.hosting_config.cookie_config.domain
    cookie_secure = settings.hosting_config.cookies_use_secure_transport()

    kwargs: dict[str, object] = {
        "httponly": True,
        "secure": cookie_secure,
        # "lax" allows the cookie to be sent on top-level cross-site navigations
        # (e.g. OAuth callback redirects, magic-link redirects) while still
        # blocking cross-site POST/PUT/DELETE requests (CSRF protection).
        "samesite": "lax",
        "max_age": ACCESS_COOKIE_TTL_SECONDS,
        "path": "/",
    }
    if cookie_domain:
        kwargs["domain"] = cookie_domain

    response.set_cookie(key=ACCESS_COOKIE_KEY, value=value, **kwargs)


def set_refresh_cookie(response: Response, value: str) -> None:
    settings = get_settings()
    cookie_domain = settings.hosting_config.cookie_config.domain
    cookie_secure = settings.hosting_config.cookies_use_secure_transport()

    kwargs: dict[str, object] = {
        "httponly": True,
        "secure": cookie_secure,
        "samesite": "strict",
        "max_age": REFRESH_COOKIE_TTL_SECONDS,
        "path": "/api/auth/refresh",
    }
    if cookie_domain:
        kwargs["domain"] = cookie_domain

    response.set_cookie(key=REFRESH_COOKIE_KEY, value=value, **kwargs)


def clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    cookie_domain = settings.hosting_config.cookie_config.domain

    access_kwargs: dict[str, object] = {"path": "/"}
    refresh_kwargs: dict[str, object] = {"path": "/api/auth/refresh"}
    if cookie_domain:
        access_kwargs["domain"] = cookie_domain
        refresh_kwargs["domain"] = cookie_domain

    response.delete_cookie(ACCESS_COOKIE_KEY, **access_kwargs)
    response.delete_cookie(REFRESH_COOKIE_KEY, **refresh_kwargs)
