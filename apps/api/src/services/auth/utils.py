import secrets
from typing import Any

from fastapi import HTTPException, Request
from sqlmodel import Session, select
from ulid import ULID

from src.db.users import User
from src.services.users.users import ensure_user_has_default_role


async def find_or_create_google_user(
    request: Request,
    google_user_data: dict[str, Any],
    current_user: Any,
    db_session: Session,
) -> User:
    """Find an existing user by Google email, or create a new one.

    Returns the ORM User object so the caller can build a login response
    without an extra DB round-trip.
    """
    user_email = google_user_data.get("email", "")
    if not user_email:
        raise HTTPException(
            status_code=400, detail="No email address available from Google"
        )

    user = db_session.exec(select(User).where(User.email == user_email)).first()

    if not user:
        given_name = google_user_data.get("given_name", "")
        family_name = google_user_data.get("family_name", "")
        picture = google_user_data.get("picture", "")
        google_sub = google_user_data.get("sub", "")

        parts = [p for p in [given_name, family_name] if p]
        if not parts:
            parts = [user_email.split("@")[0] if "@" in user_email else "user"]
        username = "".join(parts) + str(1000 + secrets.randbelow(9000))

        user = User(
            email=user_email,
            username=username,
            first_name=given_name,
            last_name=family_name,
            avatar_image=picture,
            auth_provider="google",
            google_sub=google_sub or None,
            user_uuid=f"user_{ULID()}",
            hashed_password=None,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

    ensure_user_has_default_role(db_session, user.id)
    return user
