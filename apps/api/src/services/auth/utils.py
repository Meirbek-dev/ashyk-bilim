import random
from typing import Any

from fastapi import HTTPException, Request
from sqlmodel import Session, select

from src.db.users import User, UserCreate, UserRead
from src.services.users.users import (
    create_user_without_platform,
    ensure_user_has_default_role,
)


async def find_or_create_google_user(
    request: Request,
    google_user_data: dict[str, Any],
    current_user: Any,
    db_session: Session,
) -> UserRead:
    """Find an existing user by Google email, or create a new one.

    This is the shared core used by both the legacy access-token OAuth endpoint
    and the new backend-driven Authorization Code flow.
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

        username_parts = []
        if given_name:
            username_parts.append(given_name)
        if family_name:
            username_parts.append(family_name)
        if not username_parts and "@" in user_email:
            email_prefix = user_email.split("@")[0]
            if email_prefix:
                username_parts.append(email_prefix)
        if not username_parts:
            username_parts.append("user")

        username = "".join(username_parts) + str(random.randint(10, 999))

        user_object = UserCreate(
            email=user_email,
            username=username,
            password="",
            first_name=given_name,
            last_name=family_name,
            avatar_image=picture,
        )

        user_read = await create_user_without_platform(
            request, db_session, current_user, user_object
        )

        # Mark as Google OAuth user
        created_user = db_session.exec(
            select(User).where(User.user_uuid == user_read.user_uuid)
        ).first()
        if created_user:
            created_user.auth_provider = "google"
            created_user.google_sub = google_sub or None
            db_session.add(created_user)
            db_session.commit()

        return user_read

    ensure_user_has_default_role(db_session, user.id)
    return UserRead.model_validate(user)
