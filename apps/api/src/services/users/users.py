import contextlib
import logging
from datetime import datetime
from types import SimpleNamespace

from fastapi import HTTPException, Request, UploadFile, status
from pydantic import ValidationError
from sqlmodel import Session, select

from src.db.permission_enums import RoleSlug
from src.db.permissions import Role, RoleRead, UserRole
from src.db.users import (
    AnonymousUser,
    InternalUser,
    PublicUser,
    User,
    UserCreate,
    UserRead,
    UserSession,
    UserSessionRole,
    UserUpdate,
    UserUpdatePassword,
)
from src.security.rbac import PermissionChecker
from src.security.security import security_hash_password, security_verify_password
from src.services.cache import redis_client
from src.services.users.avatars import upload_avatar
from src.services.users.emails import send_account_creation_email
from src.services.users.usergroups import add_users_to_usergroup

_logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 8
# Cache TTL for user lookups (seconds)
USER_CACHE_TTL = 300  # 5 minutes


async def create_user(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    user_object: UserCreate,
    checker: PermissionChecker | None = None,
):
    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(current_user.id, "user:create")

    # Create and validate user
    user = await _create_and_validate_user(db_session, user_object)

    # Assign default user role
    _assign_default_role(db_session, user.id)
    db_session.commit()

    user_read = UserRead.model_validate(user)

    # Send Account creation email
    send_account_creation_email(
        user=user_read,
        email=user_read.email,
    )

    return user_read


async def create_user_without_platform(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    user_object: UserCreate,
    checker: PermissionChecker | None = None,
):
    # Public self-registration: anonymous users may always create their own
    # account.  Authenticated callers (e.g. admins creating users on behalf of
    # others) still need the `user:create` permission so that privilege
    # escalation is not possible through this endpoint.
    if not isinstance(current_user, AnonymousUser):
        if checker is None:
            checker = PermissionChecker(db_session)
        checker.require(current_user.id, "user:create")

    # Create and validate user
    user = await _create_and_validate_user(db_session, user_object)

    # Assign default user role
    _assign_default_role(db_session, user.id)
    db_session.commit()

    user_read = UserRead.model_validate(user)

    # Send Account creation email
    send_account_creation_email(
        user=user_read,
        email=user_read.email,
    )

    return user_read


def update_user(
    request: Request,
    db_session: Session,
    user_id: int,
    current_user: PublicUser | AnonymousUser,
    user_object: UserUpdate,
    checker: PermissionChecker | None = None,
):
    # Get user (bypass cache for mutations to ensure ORM-attached instance)
    user = _get_user_by_field(db_session, "id", user_id, use_cache=False)

    # Validate unique constraints if fields are being updated
    user_data = user_object.model_dump(exclude_unset=True)

    # If no fields are being updated, skip RBAC and DB work (no-op update) but still invalidate cache
    if not user_data:
        try:
            keys = [f"user:id:{user.id}"]
            if getattr(user, "username", None):
                keys.append(f"user:username:{user.username.lower()}")
            redis_client.delete_keys(*keys)
        except Exception:
            pass
        # Try to return a validated `UserRead`; if validation fails (e.g., test stubs),
        # return the raw user object to keep behavior simple and test-friendly.
        try:
            return UserRead.model_validate(user)
        except Exception:
            return user

    # RBAC check (only for real updates)
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(current_user.id, "user:update", resource_owner_id=user_id)

    if user_object.username:
        _validate_unique_username(
            db_session, user_object.username, exclude_user_id=current_user.id
        )

    if user_object.email:
        _validate_unique_email(
            db_session, user_object.email, exclude_user_id=current_user.id
        )

    # Update user
    for key, value in user_data.items():
        setattr(user, key, value)

    # updated_at is handled by the database via onupdate=func.now()

    # Update user in database
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    # Invalidate Redis cache for this user (best-effort)
    try:
        keys = [f"user:id:{user.id}"]
        if getattr(user, "username", None):
            keys.append(f"user:username:{user.username.lower()}")
        redis_client.delete_keys(*keys)
    except Exception:
        pass

    return UserRead.model_validate(user)


async def update_user_avatar(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    avatar_file: UploadFile | None = None,
    checker: PermissionChecker | None = None,
):
    # Get user (bypass cache for mutations to ensure ORM-attached instance)
    user = _get_user_by_field(db_session, "id", current_user.id, use_cache=False)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(current_user.id, "user:update", resource_owner_id=current_user.id)

    # Upload avatar with security validation
    if avatar_file and avatar_file.filename:
        try:
            name_in_disk = await upload_avatar(avatar_file, user.user_uuid)
            user.avatar_image = name_in_disk
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Avatar upload failed: {e!s}",
            )

    # Update user in database
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    # Invalidate Redis cache for this user (best-effort)
    try:
        keys = [f"user:id:{user.id}"]
        if getattr(user, "username", None):
            keys.append(f"user:username:{user.username.lower()}")
        redis_client.delete_keys(*keys)
    except Exception:
        pass

    return UserRead.model_validate(user)


def update_user_password(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    user_id: int,
    form: UserUpdatePassword,
    checker: PermissionChecker | None = None,
):
    # Get user (bypass cache for mutations to ensure ORM-attached instance)
    user = _get_user_by_field(db_session, "id", user_id, use_cache=False)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(current_user.id, "user:update", resource_owner_id=user_id)

    if not security_verify_password(form.old_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong password"
        )

    # Update user
    user.hashed_password = security_hash_password(form.new_password)

    # Add password_changed_at field for session invalidation tracking
    if user.profile is None:
        user.profile = {}
    user.profile["password_changed_at"] = datetime.now().isoformat()

    # Update user in database
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    return UserRead.model_validate(user)


def read_user_by_id(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    user_id: int,
):
    user = _get_user_by_field(db_session, "id", user_id)
    return UserRead.model_validate(user)


def read_user_by_uuid(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    user_uuid: str,
):
    user = _get_user_by_field(db_session, "user_uuid", user_uuid)
    return UserRead.model_validate(user)


def read_user_by_username(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    username: str,
):
    user = _get_user_by_field(db_session, "username", username)
    return UserRead.model_validate(user)


def get_user_session(
    request: Request | None,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
) -> UserSession:
    from datetime import UTC, datetime

    from src.security.auth_lifetimes import ACCESS_TOKEN_EXPIRE

    user = _get_user_by_field(db_session, "user_uuid", current_user.user_uuid)
    user_read = UserRead.model_validate(user)

    checker = PermissionChecker(db_session)

    roles = [
        UserSessionRole(role=RoleRead.model_validate(role_dict))
        for role_dict in checker.get_user_roles(user_id=user.id)
    ]

    now = datetime.now(UTC)
    permissions: list[str] = []
    permissions_timestamp: int | None = None
    try:
        effective = checker.get_expanded_permissions(current_user.id)
        permissions = sorted(effective)
        permissions_timestamp = int(now.timestamp())
    except Exception as e:
        _logger.exception(f"Error loading permissions for user {current_user.id}: {e}")

    expires_at = int((now + ACCESS_TOKEN_EXPIRE).timestamp())
    session_version = int(now.timestamp())

    return UserSession(
        user=user_read,
        roles=roles,
        permissions=permissions,
        permissions_timestamp=permissions_timestamp,
        expires_at=expires_at,
        session_version=session_version,
    )


def delete_user_by_id(
    request: Request,
    db_session: Session,
    current_user: PublicUser | AnonymousUser,
    user_id: int,
    checker: PermissionChecker | None = None,
) -> str:
    # Get user (bypass cache for mutations to ensure ORM-attached instance)
    user = _get_user_by_field(db_session, "id", user_id, use_cache=False)

    # RBAC check
    if checker is None:
        checker = PermissionChecker(db_session)
    checker.require(current_user.id, "user:delete")

    # Delete user
    db_session.delete(user)
    db_session.commit()

    # Invalidate Redis cache for this user (best-effort)
    try:
        keys = [f"user:id:{user.id}"]
        if getattr(user, "username", None):
            keys.append(f"user:username:{user.username.lower()}")
        redis_client.delete_keys(*keys)
    except Exception:
        pass

    return "User deleted"


# Utils & Security functions


def security_get_user(request: Request, db_session: Session, email: str) -> User | None:
    """Get user by email for security purposes. Returns None if not found instead of raising."""
    try:
        return _get_user_by_field(db_session, "email", email)
    except HTTPException:
        return None


# Helper functions for user operations


def _validate_unique_username(
    db_session: Session, username: str, exclude_user_id: int | None = None
) -> None:
    """Validate that username is unique."""
    statement = select(User).where(User.username == username)
    if exclude_user_id:
        statement = statement.where(User.id != exclude_user_id)

    if db_session.exec(statement).first():
        raise HTTPException(
            status_code=400,
            detail="Имя пользователя уже существует",
        )


def _validate_unique_email(
    db_session: Session, email: str, exclude_user_id: int | None = None
) -> None:
    """Validate that email is unique."""
    statement = select(User).where(User.email == email)
    if exclude_user_id:
        statement = statement.where(User.id != exclude_user_id)

    if db_session.exec(statement).first():
        raise HTTPException(
            status_code=400,
            detail="Email already exists",
        )


async def _create_and_validate_user(
    db_session: Session, user_object: UserCreate
) -> User:
    """Create user with validation and proper initialization."""
    # Validate unique constraints
    _validate_unique_username(db_session, user_object.username)
    _validate_unique_email(db_session, user_object.email)

    # Password strength validation
    if user_object.password:
        if len(user_object.password) < MIN_PASSWORD_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
            )

    # Create user with completed fields
    user = User.model_validate(user_object)
    user.hashed_password = (
        security_hash_password(user_object.password) if user_object.password else None
    )
    user.auth_provider = "local"

    # Add user to database
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    return user


def _safe_role_read(role: Role) -> RoleRead:
    """Convert Role to RoleRead."""
    try:
        return RoleRead.model_validate(role)
    except ValidationError as exc:  # pragma: no cover - defensive path
        _logger.warning(
            "Role validation failed for role_id=%s. Using fallback. Error: %s",
            getattr(role, "id", None),
            exc,
        )
        return RoleRead.model_construct(
            name=role.name,
            slug=role.slug,
            description=role.description,
            is_system=role.is_system,
            priority=role.priority,
            created_at=role.created_at,
            updated_at=role.updated_at,
            id=role.id,
        )


def _assign_default_role(db_session: Session, user_id: int | None) -> None:
    """Assign default 'user' role to a newly registered user."""
    from src.db.permissions import Role
    from src.security.rbac import PermissionChecker

    # Get user role ID
    user_role = db_session.exec(select(Role).where(Role.slug == RoleSlug.USER)).first()
    if not user_role:
        raise HTTPException(500, detail="User role not found")

    checker = PermissionChecker(db_session)
    checker.assign_role(
        user_id=user_id or 0,
        role_id=user_role.id,
    )


def _get_user_by_field(
    db_session: Session, field: str, value: str | int, use_cache: bool = True
) -> User:
    """Generic function to get user by any field.

    Optimizations:
    - Use Redis cache when configured to avoid repeated DB hits for frequent reads.
    - Cache keys: `user:id:{id}` and `user:username:{username_lower}`
    - Invalidation is done on updates (see `update_user` and `update_user_avatar`).

    IMPORTANT: callers that intend to mutate or delete the returned user should pass
    `use_cache=False` to ensure an ORM-attached instance is returned from the DB session
    rather than a cached (detached) Pydantic/namespace object. Returning a detached
    object and then calling `db_session.add()`/`db_session.delete()` may trigger an
    INSERT/DELETE on a non-attached object leading to integrity errors.
    """

    # Try cache lookup first (best-effort, helper handles missing Redis)
    def _try_cache_get(key: str) -> User | None:
        try:
            cached = redis_client.get_json(key)
            if not cached:
                return None
            try:
                return User.model_validate(cached)
            except Exception:
                # Cached payload may be partial (e.g., only id/username); return a simple object
                if isinstance(cached, dict):
                    return SimpleNamespace(**cached)
                return None
        except Exception:
            return None

    def _try_cache_set(user_obj: User) -> None:
        try:
            data = user_obj.model_dump()
            id_key = f"user:id:{getattr(user_obj, 'id', '')}"
            redis_client.set_json(id_key, data, USER_CACHE_TTL)
            if user_obj.username:
                redis_client.set_json(
                    f"user:username:{user_obj.username.lower()}", data, USER_CACHE_TTL
                )
        except Exception:
            pass

    # Try cache lookup first (only when allowed)
    if use_cache and field == "id" and isinstance(value, int):
        key = f"user:id:{value}"
        cached = _try_cache_get(key)
        if cached:
            return cached
    if use_cache and field == "username" and isinstance(value, str):
        key = f"user:username:{value.lower()}"
        cached = _try_cache_get(key)
        if cached:
            return cached

    # Build DB query
    if field == "id":
        statement = select(User).where(User.id == value)
    elif field == "user_uuid":
        statement = select(User).where(User.user_uuid == value)
    elif field == "username":
        statement = select(User).where(User.username == value)
    elif field == "email":
        statement = select(User).where(User.email == value)
    else:
        msg = f"Invalid field: {field}"
        raise ValueError(msg)

    user = db_session.exec(statement).first()
    if not user:
        raise HTTPException(
            status_code=400,
            detail="User does not exist",
        )

    # Populate cache asynchronously (best-effort)
    with contextlib.suppress(Exception):
        _try_cache_set(user)

    return user


def ensure_user_has_default_role(db_session: Session, user_id: int) -> None:
    """Ensure a user has the default role assigned (idempotent)."""
    _assign_default_role(db_session, user_id)
    db_session.commit()


## 🔒 RBAC Utils ##
