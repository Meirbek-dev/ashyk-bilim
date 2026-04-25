"""Password reset via signed single-use JWT token (link in email)."""

import logging
import time
import uuid
from typing import Any

import jwt as pyjwt
from fastapi import HTTPException
from pydantic import EmailStr
from sqlmodel import Session, select

from src.db.users import User
from src.security.keys import get_jwt_secret
from src.security.security import security_hash_password
from src.services.auth.sessions import revoke_all_user_sessions
from src.services.cache.redis_client import get_async_redis_client
from src.services.users.emails import send_password_reset_email

logger = logging.getLogger(__name__)

RESET_TOKEN_TTL = 15 * 60  # 15 minutes
RESET_JTI_PREFIX = "reset_jti:"


def _create_reset_token(user_uuid: str) -> tuple[str, str]:
    jti = str(uuid.uuid4())
    now = int(time.time())
    payload = {
        "sub": user_uuid,
        "jti": jti,
        "type": "password_reset",
        "iat": now,
        "exp": now + RESET_TOKEN_TTL,
    }
    token_str = pyjwt.encode(payload, get_jwt_secret(), algorithm="HS256")
    return token_str, jti


def _verify_reset_token(token: str) -> dict[str, Any]:
    try:
        payload = pyjwt.decode(
            token,
            get_jwt_secret(),
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except pyjwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=400, detail="Reset token has expired") from exc
    except pyjwt.PyJWTError as exc:
        raise HTTPException(
            status_code=400, detail="Invalid or expired reset token"
        ) from exc

    if payload.get("type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid token type")
    return payload


async def send_reset_password_code(
    db_session: Session,
    email: EmailStr,
) -> str:
    """Always returns success message to prevent email enumeration."""
    statement = select(User).where(User.email == email)
    user = db_session.exec(statement).first()
    if not user:
        return "If that email exists, a reset link has been sent"

    r = get_async_redis_client()
    if not r:
        logger.error("Redis unavailable for password reset")
        raise HTTPException(status_code=500, detail="Service temporarily unavailable")

    token_str, jti = _create_reset_token(str(user.user_uuid))

    await r.set(f"{RESET_JTI_PREFIX}{jti}", "pending", ex=RESET_TOKEN_TTL)

    try:
        from src.db.users import UserRead

        user_read = UserRead.model_validate(user)
        send_password_reset_email(
            generated_reset_code=token_str,
            user=user_read,
            email=user.email,
        )
    except Exception:
        logger.exception("Failed to send reset email for %s", email)

    return "If that email exists, a reset link has been sent"


async def change_password_with_reset_code(
    db_session: Session,
    token: str,
    new_password: str,
) -> str:
    r = get_async_redis_client()
    if not r:
        raise HTTPException(status_code=500, detail="Service temporarily unavailable")

    payload = _verify_reset_token(token)
    jti = payload.get("jti", "")
    user_uuid = payload.get("sub", "")

    jti_key = f"{RESET_JTI_PREFIX}{jti}"
    if not await r.exists(jti_key):
        raise HTTPException(
            status_code=400, detail="Reset token has already been used or expired"
        )

    user = db_session.exec(select(User).where(User.user_uuid == user_uuid)).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    await r.delete(jti_key)

    user.hashed_password = security_hash_password(new_password)
    db_session.add(user)
    db_session.commit()

    await revoke_all_user_sessions(user.id)

    return "Password changed successfully"
