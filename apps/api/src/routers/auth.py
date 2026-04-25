import logging
from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from src.auth.manager import UserManager, get_user_manager
from src.auth.users import CurrentActiveUser, auth_backend
from src.db.users import AnonymousUser, User, UserSession
from src.infra.db.session import get_db_session
from src.infra.settings import get_settings
from src.security.auth_cookies import (
    REFRESH_COOKIE_KEY,
    clear_auth_cookies,
    set_access_cookie,
    set_refresh_cookie,
)
from src.services.auth.google_oauth import exchange_google_code, get_google_authorize_url
from src.services.auth.sessions import (
    create_auth_session,
    get_user_active_sessions,
    inspect_refresh_session,
    revoke_session,
    revoke_token_family,
    rotate_session,
)
from src.services.auth.utils import find_or_create_google_user
from src.services.users.users import get_user_session

router = APIRouter()
logger = logging.getLogger(__name__)


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
    port_suffix = f":{port}" if port not in (80, 443) else ""
    return f"{proto}://{domain}{port_suffix}/api/v1/auth/google/callback"


async def _build_login_response(
    request: Request,
    user: User,
    user_manager: UserManager,
) -> Response:
    access_token = await auth_backend.get_strategy().write_token(user)
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
        detail="Invalid callback URL",
    )


@router.post("/login")
async def login(
    request: Request,
    credentials: Annotated[OAuth2PasswordRequestForm, Depends()],
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
) -> Response:
    user = await user_manager.authenticate(credentials)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LOGIN_BAD_CREDENTIALS",
        )

    return await _build_login_response(request, user, user_manager)


@router.post("/logout")
async def logout(
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    refresh_token = request.cookies.get(REFRESH_COOKIE_KEY)
    if refresh_token:
        inspection = await inspect_refresh_session(db_session, refresh_token)
        if inspection.status == "active" and inspection.session and inspection.user_id:
            await revoke_session(inspection.session.session_id, inspection.user_id)
        elif (
            inspection.status == "reused"
            and inspection.token_family_id
            and inspection.user_id
        ):
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


@router.get("/sessions")
async def list_sessions(
    current_user: CurrentActiveUser,
):
    return await get_user_active_sessions(current_user.id)


@router.post("/refresh")
async def refresh_token(
    request: Request,
    response: Response,
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """Exchange a valid refresh token cookie for a new access token + rotated refresh token."""
    token = request.cookies.get(REFRESH_COOKIE_KEY)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
        )

    inspection = await inspect_refresh_session(db_session, token)

    if inspection.status == "reused":
        if inspection.token_family_id and inspection.user_id:
            await revoke_token_family(inspection.token_family_id, inspection.user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token reuse detected — all sessions have been revoked",
        )

    if (
        inspection.status != "active"
        or inspection.session is None
        or inspection.user_id is None
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user = db_session.exec(
        select(User).where(User.id == inspection.user_id)
    ).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    _, new_refresh_token = await rotate_session(
        old_session=inspection.session,
        user=user,
        ip_address=ip,
        user_agent=ua,
    )

    access_token = await auth_backend.get_strategy().write_token(user)
    set_access_cookie(response, access_token)
    set_refresh_cookie(response, new_refresh_token)

    return {"status": "ok"}


@router.get("/google/authorize")
async def google_authorize(
    callback: str,
):
    """Redirect to Google OAuth consent screen."""
    _validate_callback_url(callback)

    settings = get_settings()
    if not settings.google_oauth.client_id:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured",
        )

    auth_url = await get_google_authorize_url(
        client_id=settings.google_oauth.client_id,
        redirect_uri=_resolve_google_redirect_uri(),
        callback=callback,
    )
    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """Handle Google OAuth callback."""
    if error:
        logger.error("Google OAuth error: %s", error)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google OAuth error: {error}",
        )

    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing authorization code",
        )

    settings = get_settings()
    redirect_uri = _resolve_google_redirect_uri()

    try:
        userinfo = await exchange_google_code(
            client_id=settings.google_oauth.client_id or "",
            client_secret=settings.google_oauth.client_secret or "",
            code=code,
            redirect_uri=redirect_uri,
            state=state,
        )

        frontend_callback = userinfo.get("frontend_callback", "/")

        user_read = await find_or_create_google_user(
            request=request,
            google_user_data=userinfo,
            current_user=AnonymousUser(),
            db_session=db_session,
        )

        user = db_session.exec(
            select(User).where(User.user_uuid == user_read.user_uuid)
        ).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve user after creation",
            )

        response = await _build_login_response(request, user, user_manager)
        response.status_code = status.HTTP_307_TEMPORARY_REDIRECT
        response.headers["Location"] = frontend_callback

    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error during Google OAuth callback")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during authentication",
        )
    else:
        return response
