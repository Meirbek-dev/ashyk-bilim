import secrets

from fastapi import HTTPException, Request
from sqlmodel import Session, select
from ulid import ULID

from src.db.users import User
from src.services.auth.usernames import build_generated_username
from src.services.users.users import ensure_user_has_default_role
from src.types import require_persisted_id
from src.types.narrowing import as_str


async def find_or_create_google_user(
    request: Request,
    google_user_data: dict[str, object],
    current_user: object,
    db_session: Session,
) -> User:
    """Find an existing user by Google email, or create a new one.

    Returns the ORM User object so the caller can build a login response
    without an extra DB round-trip.
    """
    user_email = as_str(google_user_data.get("email", ""), field="email")
    if not user_email:
        raise HTTPException(status_code=400, detail="No email address available from Google")

    user = db_session.exec(select(User).where(User.email == user_email)).first()

    if not user:
        given_name = as_str(google_user_data.get("given_name", ""), field="given_name")
        family_name = as_str(google_user_data.get("family_name", ""), field="family_name")
        picture = as_str(google_user_data.get("picture", ""), field="picture")
        google_sub = as_str(google_user_data.get("sub", ""), field="sub")

        username = build_generated_username(
            given_name,
            family_name,
            email=user_email,
            suffix=str(1000 + secrets.randbelow(9000)),
        )

        user = User(
            email=user_email,
            username=username,
            first_name=given_name,
            last_name=family_name,
            avatar_image=picture,
            auth_provider="google",
            google_sub=google_sub or None,
            user_uuid=f"user_{ULID()}",
            hashed_password="",
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

    ensure_user_has_default_role(db_session, require_persisted_id(user.id, model_name="User"))
    return user
