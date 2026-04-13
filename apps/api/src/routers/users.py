from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, UploadFile
from pydantic import EmailStr
from sqlmodel import Session

from src.db.courses.courses import CourseRead
from src.db.users import (
    PublicUser,
    UserCreate,
    UserRead,
    UserSession,
    UserUpdate,
    UserUpdatePassword,
)
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user
from src.security.rbac import (
    PermissionCheckerDep,
    PermissionDenied,
    ResourceAccessDenied,
)
from src.services.courses.courses import get_user_courses
from src.services.users.password_reset import (
    change_password_with_reset_code,
    send_reset_password_code,
)
from src.services.users.users import (
    create_user_without_platform,
    delete_user_by_id,
    get_user_session,
    read_user_by_id,
    read_user_by_username,
    read_user_by_uuid,
    update_user,
    update_user_avatar,
    update_user_password,
)

router = APIRouter()


@router.get("/profile", response_model=UserRead)
def api_get_current_user(
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> UserRead:
    """
    Get current user
    """
    return current_user


@router.get("/session", response_model=UserSession)
def api_get_current_user_session(
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
) -> UserSession:
    """
    Get current user session.
    """
    return get_user_session(
        request,
        db_session,
        current_user,
    )


@router.post("", tags=["users"])
async def api_create_user_without_platform(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    user_object: UserCreate,
) -> UserRead:
    """
    Create User
    """
    return await create_user_without_platform(
        request, db_session, current_user, user_object
    )


@router.get("/id/{user_id}", tags=["users"])
def api_get_user_by_id(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    user_id: int,
    response: Response,
) -> UserRead:
    """
    Get User by ID
    """
    # Short client-side cache; data is user-scoped and should be private
    response.headers["Cache-Control"] = "private, max-age=60"
    return read_user_by_id(request, db_session, current_user, user_id)


@router.get("/uuid/{user_uuid}", tags=["users"])
def api_get_user_by_uuid(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    user_uuid: str,
) -> UserRead:
    """
    Get User by UUID
    """
    return read_user_by_uuid(request, db_session, current_user, user_uuid)


@router.get("/username/{username}", tags=["users"])
def api_get_user_by_username(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    username: str,
    response: Response,
) -> UserRead:
    """
    Get User by Username
    """
    # Short client-side cache; data is user-scoped and should be private
    response.headers["Cache-Control"] = "private, max-age=60"
    return read_user_by_username(request, db_session, current_user, username)


@router.put("/{user_id}", tags=["users"])
def api_update_user(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    user_id: int,
    user_object: UserUpdate,
) -> UserRead:
    """
    Update User

    **Required Permission**: `user:update:own` (for own profile) or `user:update:platform` (for others)
    """
    # Check if updating own profile or another user's profile
    is_own_profile = user_id == current_user.id

    if not is_own_profile:
        checker.require(current_user.id, "user:update")

    return update_user(request, db_session, user_id, current_user, user_object)


@router.put("/update_avatar/{user_id}", tags=["users"])
async def api_update_avatar_user(
    *,
    request: Request,
    user_id: int,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    avatar_file: UploadFile | None = None,
) -> UserRead:
    """
    Update User Avatar

    **Required Permission**: `user:update:own` (for own avatar) or `user:update:platform` (for others)
    """
    # Check if updating own avatar or another user's avatar
    is_own_avatar = user_id == current_user.id

    if not is_own_avatar:
        checker.require(current_user.id, "user:update")

    return await update_user_avatar(request, db_session, current_user, avatar_file)


@router.put("/change_password/{user_id}", tags=["users"])
def api_update_user_password(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    user_id: int,
    form: UserUpdatePassword,
) -> UserRead:
    """
    Update User Password

    **Required Permission**: Own account only (for security)
    """
    # Password changes restricted to own account only
    if user_id != current_user.id:
        raise ResourceAccessDenied(reason="You can only change your own password")

    return update_user_password(request, db_session, current_user, user_id, form)


@router.put("/preferences/theme/{user_id}", tags=["users"])
def api_update_user_theme(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    user_id: int,
    theme: str,
) -> UserRead:
    """
    Update User Theme Preference
    """
    user_update = UserUpdate(theme=theme)
    return update_user(request, db_session, user_id, current_user, user_update)


@router.put("/preferences/locale/{user_id}", tags=["users"])
def api_update_user_locale(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    user_id: int,
    locale: str,
) -> UserRead:
    """
    Update User Locale Preference
    """
    user_update = UserUpdate(locale=locale)
    return update_user(request, db_session, user_id, current_user, user_update)


@router.post("/reset_password/change_password/{email}", tags=["users"])
async def api_change_password_with_reset_code(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    new_password: str,
    email: EmailStr,
    reset_code: str,
):
    """
    Change password with reset code
    """
    return await change_password_with_reset_code(
        request,
        db_session,
        current_user,
        new_password,
        email,
        reset_code,
    )


@router.post("/reset_password/send_reset_code/{email}", tags=["users"])
async def api_send_password_reset_email(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    email: EmailStr,
):
    """
    Send password reset email
    """
    return await send_reset_password_code(
        request,
        db_session,
        current_user,
        email,
    )


@router.delete("/user_id/{user_id}", tags=["users"])
def api_delete_user(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    user_id: int,
):
    """
    Delete User

    **Required Permission**: `user:delete:platform`
    """
    checker.require(current_user.id, "user:delete")

    # Prevent self-deletion
    if user_id == current_user.id:
        raise ResourceAccessDenied(
            reason="You cannot delete your own account through this endpoint"
        )

    return delete_user_by_id(request, db_session, current_user, user_id)


@router.get("/{user_id}/courses", tags=["users"])
async def api_get_user_courses(
    *,
    request: Request,
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    user_id: int,
    page: int = 1,
    limit: int = 20,
) -> list[CourseRead]:
    """
    Get courses made or contributed by a user.
    """
    return await get_user_courses(
        request=request,
        current_user=current_user,
        user_id=user_id,
        db_session=db_session,
        page=page,
        limit=limit,
    )
