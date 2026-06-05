import contextlib
import logging
from typing import Annotated, cast
from urllib.parse import parse_qsl, urlencode, urlparse, urlsplit, urlunsplit

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users import exceptions
from fastapi_users.authentication import JWTStrategy
from fastapi_users.router.common import ErrorCode
from pydantic import EmailStr
from sqlmodel import Session, select

from config.config import secret_value
from src.auth.manager import UserManager, get_user_manager
from src.auth.users import CurrentActiveUser, auth_backend
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import AnonymousUser, User, UserSession
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.security.auth_cookies import (
    REFRESH_COOKIE_KEY,
    clear_auth_cookies,
    set_access_cookie,
    set_refresh_cookie,
)
from src.services.auth.google_oauth import (
    exchange_google_code,
    get_frontend_callback_from_state,
    get_google_authorize_url,
)
from src.services.auth.rate_limiter import (
    RateLimitExceeded,
    check_account_locked,
    check_rate_limit,
    clear_login_failures,
    record_login_failure,
)
from src.services.auth.sessions import (
    create_auth_session,
    get_user_active_sessions,
    inspect_refresh_session,
    revoke_session,
    revoke_token_family,
    rotate_session,
)
from src.services.auth.utils import find_or_create_google_user
from src.services.rate_limit import ip_key, rate_limit_dependency
from src.services.users.users import get_user_session

router = APIRouter()
logger = logging.getLogger(__name__)


class AuthLoginResponse(PydanticStrictBaseModel):
    access_token: str
    token_type: str


class AuthSessionRead(PydanticStrictBaseModel):
    session_id: str
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: int
    last_seen_at: int


class AuthRefreshResponse(PydanticStrictBaseModel):
    status: str


class AuthActionResponse(PydanticStrictBaseModel):
    status: str


_limit_auth_login_ip = rate_limit_dependency(
    namespace="auth:login:ip",
    max_requests=20,
    window_seconds=60,
    key_func=ip_key,
)
_limit_auth_refresh_ip = rate_limit_dependency(
    namespace="auth:refresh:ip",
    max_requests=60,
    window_seconds=60,
    key_func=ip_key,
)
_limit_google_oauth_ip = rate_limit_dependency(
    namespace="auth:google:ip",
    max_requests=30,
    window_seconds=60,
    key_func=ip_key,
)
auth_sensitive_rate_limit = _limit_auth_login_ip


@router.post(
    "/forgot-password",
    response_model=AuthActionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(auth_sensitive_rate_limit)],
)
async def forgot_password(
    request: Request,
    email: Annotated[EmailStr, Body(embed=True)],
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
) -> AuthActionResponse:
    try:
        user = await user_manager.get_by_email(email)
    except exceptions.UserNotExists:
        return AuthActionResponse(status="accepted")

    with contextlib.suppress(exceptions.UserInactive):
        await user_manager.forgot_password(user, request)

    return AuthActionResponse(status="accepted")


@router.post(
    "/reset-password",
    response_model=AuthActionResponse,
    dependencies=[Depends(auth_sensitive_rate_limit)],
)
async def reset_password(
    request: Request,
    token: Annotated[str, Body()],
    password: Annotated[str, Body()],
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
) -> AuthActionResponse:
    try:
        await user_manager.reset_password(token, password, request)
    except (
        exceptions.InvalidResetPasswordToken,
        exceptions.UserNotExists,
        exceptions.UserInactive,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorCode.RESET_PASSWORD_BAD_TOKEN,
        )
    except exceptions.InvalidPasswordException as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": ErrorCode.RESET_PASSWORD_INVALID_PASSWORD,
                "reason": exc.reason,
            },
        ) from exc

    return AuthActionResponse(status="ok")


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip() or None
    return request.client.host if request.client else None


def _resolve_google_redirect_uri() -> str:
    settings = get_settings()
    if settings.google_oauth.redirect_uri:
        return settings.google_oauth.redirect_uri

    proto = "https" if settings.hosting_config.ssl else "http"
    domain = settings.hosting_config.domain
    port = settings.hosting_config.port
    port_suffix = f":{port}" if port not in {80, 443} else ""
    uri = f"{proto}://{domain}{port_suffix}/api/v1/auth/google/callback"
    logger.warning(
        "PLATFORM_GOOGLE_REDIRECT_URI не задана — используем автоматически собранный '%s'. "
        "Задайте PLATFORM_GOOGLE_REDIRECT_URI явно, чтобы избежать ошибок redirect_uri_mismatch.",
        uri,
    )
    return uri


async def _build_login_response(
    request: Request,
    user: User,
    user_manager: UserManager,
) -> Response:
    strategy = cast("JWTStrategy[User, int]", auth_backend.get_strategy())
    access_token = await strategy.write_token(user)
    response = await auth_backend.transport.get_login_response(access_token)

    _, refresh_token = await create_auth_session(
        user=user,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    set_refresh_cookie(response, refresh_token)
    await user_manager.on_after_login(user, request, response)
    return response


def _validate_callback_url(callback: str) -> None:
    """Reject callbacks pointing outside the configured domain (open-redirect guard)."""
    if callback.startswith("/"):
        return

    settings = get_settings()
    parsed = urlparse(callback)
    origin = f"{parsed.scheme}://{parsed.netloc}".lower()

    if origin in (o.lower() for o in settings.hosting_config.allowed_origins):
        return

    domain = settings.hosting_config.domain.lower()
    netloc = parsed.netloc.lower()
    if netloc == domain or netloc.endswith(f".{domain}"):
        return

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Некорректный URL обратного вызова",
    )


def _build_google_error_redirect(callback: str, error_code: str) -> str:
    parts = urlsplit(callback)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["error"] = error_code
    return urlunsplit((
        parts.scheme,
        parts.netloc,
        parts.path,
        urlencode(query),
        parts.fragment,
    ))


def _rate_limit_http_error(exc: RateLimitExceeded) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "error_code": "RATE_LIMIT_EXCEEDED",
            "message": "Слишком много попыток. Попробуйте позже.",
            "retry_after": exc.retry_after,
        },
        headers={"Retry-After": str(exc.retry_after)},
    )


@router.post("/login", response_model=AuthLoginResponse, dependencies=[Depends(_limit_auth_login_ip)])
async def login(
    request: Request,
    credentials: Annotated[OAuth2PasswordRequestForm, Depends()],
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
) -> Response:
    email = credentials.username.strip().lower()
    if await check_account_locked(email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error_code": "ACCOUNT_TEMPORARILY_LOCKED",
                "message": "Слишком много неудачных попыток входа. Попробуйте позже.",
            },
            headers={"Retry-After": "900"},
        )
    try:
        await check_rate_limit(
            key=f"login:email:{email}",
            max_requests=5,
            window_seconds=900,
        )
    except RateLimitExceeded as exc:
        raise _rate_limit_http_error(exc) from exc

    user = await user_manager.authenticate(credentials)
    if user is None:
        await record_login_failure(email)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LOGIN_BAD_CREDENTIALS",
        )

    await clear_login_failures(email)
    return await _build_login_response(request, user, user_manager)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    refresh_token = request.cookies.get(REFRESH_COOKIE_KEY)
    if refresh_token:
        inspection = await inspect_refresh_session(db_session, refresh_token)
        if inspection.status == "active" and inspection.session and inspection.user_id:
            await revoke_session(inspection.session.session_id, inspection.user_id)
        elif inspection.status == "reused" and inspection.token_family_id and inspection.user_id:
            await revoke_token_family(inspection.token_family_id, inspection.user_id)

    response = await auth_backend.transport.get_logout_response()
    clear_auth_cookies(response)
    return response


@router.get("/me", response_model=UserSession)
def get_me(
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: CurrentActiveUser,
) -> UserSession:
    return get_user_session(request, db_session, current_user)


@router.get("/sessions", response_model=list[AuthSessionRead])
async def list_sessions(
    current_user: CurrentActiveUser,
) -> list[AuthSessionRead]:
    sessions = await get_user_active_sessions(current_user.id)
    return [AuthSessionRead.model_validate(s) for s in sessions]


@router.post("/refresh", response_model=AuthRefreshResponse, dependencies=[Depends(_limit_auth_refresh_ip)])
async def refresh_token(
    request: Request,
    response: Response,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AuthRefreshResponse:
    """Exchange a valid refresh token cookie for a new access token + rotated refresh token."""
    token = request.cookies.get(REFRESH_COOKIE_KEY)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Отсутствует refresh-токен",
        )

    inspection = await inspect_refresh_session(db_session, token)

    if inspection.status == "reused":
        if inspection.token_family_id and inspection.user_id:
            await revoke_token_family(inspection.token_family_id, inspection.user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Обнаружено повторное использование refresh-токена — все сессии отозваны",
        )

    if inspection.status != "active" or inspection.session is None or inspection.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недействительный или просроченный refresh-токен",
        )

    user = db_session.exec(select(User).where(User.id == inspection.user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден или неактивен",
        )

    ip = _client_ip(request)
    ua = request.headers.get("user-agent")
    _, new_refresh_token = await rotate_session(
        old_session=inspection.session,
        user=user,
        ip_address=ip,
        user_agent=ua,
    )

    strategy = cast("JWTStrategy[User, int]", auth_backend.get_strategy())
    access_token = await strategy.write_token(user)
    set_access_cookie(response, access_token)
    set_refresh_cookie(response, new_refresh_token)

    return {"status": "ok"}


@router.get(
    "/google/authorize",
    response_class=RedirectResponse,
    dependencies=[Depends(_limit_google_oauth_ip)],
)
async def google_authorize(
    callback: str,
) -> RedirectResponse:
    """Redirect to Google OAuth consent screen."""
    _validate_callback_url(callback)

    settings = get_settings()
    if not settings.google_oauth.client_id:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth не настроен",
        )

    auth_url = await get_google_authorize_url(
        client_id=settings.google_oauth.client_id,
        redirect_uri=_resolve_google_redirect_uri(),
        callback=callback,
    )
    return RedirectResponse(url=auth_url)


@router.get(
    "/google/callback",
    response_class=RedirectResponse,
    dependencies=[Depends(_limit_google_oauth_ip)],
)
async def google_callback(
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> Response:
    """Handle Google OAuth callback."""
    # Resolve the frontend callback URL before anything else so that all error
    # redirects land in the right place.  If the state JWT is expired or
    # tampered with, _decode_state raises HTTPException — catch it here and
    # fall back to "/" rather than letting the exception bubble up as a raw
    # JSON error to the browser.
    frontend_callback = "/"
    try:
        if state:
            frontend_callback = get_frontend_callback_from_state(state) or "/"
    except HTTPException:
        pass

    if error:
        logger.error("Ошибка Google OAuth: %s", error)
        return RedirectResponse(
            url=_build_google_error_redirect(frontend_callback, "google_oauth_error"),
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )

    if not code:
        return RedirectResponse(
            url=_build_google_error_redirect(frontend_callback, "missing_authorization_code"),
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )

    settings = get_settings()
    redirect_uri = _resolve_google_redirect_uri()

    try:
        userinfo = await exchange_google_code(
            client_id=settings.google_oauth.client_id or "",
            client_secret=secret_value(settings.google_oauth.client_secret) or "",
            code=code,
            redirect_uri=redirect_uri,
            state=state,
        )

        frontend_callback = userinfo.get("frontend_callback", frontend_callback)

        user = await find_or_create_google_user(
            request=request,
            google_user_data=userinfo,
            current_user=AnonymousUser(),
            db_session=db_session,
        )

        response = await _build_login_response(request, user, user_manager)
        response.status_code = status.HTTP_307_TEMPORARY_REDIRECT
        response.headers["Location"] = frontend_callback

    except HTTPException as exc:
        logger.warning(
            "Ошибка callback Google OAuth | status=%s | detail=%s",
            exc.status_code,
            exc.detail,
        )
        return RedirectResponse(
            url=_build_google_error_redirect(frontend_callback, "google_auth_failed"),
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )
    except Exception:
        logger.exception("Непредвиденная ошибка во время callback Google OAuth")
        return RedirectResponse(
            url=_build_google_error_redirect(frontend_callback, "google_auth_failed"),
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )
    else:
        return response
