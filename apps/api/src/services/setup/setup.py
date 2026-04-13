import contextlib
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlmodel import Session, select
from ulid import ULID

from src.db.permission_enums import RoleSlug
from src.db.platform import Platform, PlatformCreate
from src.db.users import User, UserCreate, UserRead
from src.repositories.role_repository import RoleRepository
from src.security.rbac import PermissionChecker
from src.security.security import security_hash_password


# Install Default roles
def install_default_elements(db_session: Session) -> bool:
    """
    Install default elements including system roles and permissions.
    """
    created_roles = RoleRepository(db_session).seed_default_roles()
    return len(created_roles) > 0


# Platform creation
def install_create_platform(platform_object: PlatformCreate, db_session: Session):
    platform_record = Platform.model_validate(platform_object)

    # Complete the platform object
    platform_record.creation_date = str(datetime.now())
    platform_record.update_date = str(datetime.now())

    db_session.add(platform_record)
    db_session.commit()
    db_session.refresh(platform_record)

    return platform_record


def install_create_platform_user(user_object: UserCreate, db_session: Session):
    user = User.model_validate(user_object)

    # Complete the user object
    user.user_uuid = f"user_{ULID()}"
    user.password = security_hash_password(user_object.password)
    user.creation_date = str(datetime.now())
    user.update_date = str(datetime.now())

    # Username
    statement = select(User).where(User.username == user.username)
    result = db_session.exec(statement)

    if result.first():
        raise HTTPException(
            status_code=409,
            detail="Имя пользователя уже существует",
        )

    # Email
    statement = select(User).where(User.email == user.email)
    result = db_session.exec(statement)

    if result.first():
        raise HTTPException(
            status_code=409,
            detail="Пользователь с данной электронной почтой уже существует",
        )

    # Exclude unset values
    user_data = user.model_dump(exclude_unset=True)
    for key, value in user_data.items():
        setattr(user, key, value)

    # Add user to database
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    from src.db.permissions import Role

    admin_role = db_session.exec(
        select(Role).where(Role.slug == RoleSlug.ADMIN)
    ).first()
    if not admin_role:
        raise HTTPException(500, detail="Admin role not found")

    # Link user to platform by assigning admin role
    checker = PermissionChecker(db_session)
    checker.assign_role(
        user_id=user.id or 0,
        role_id=admin_role.id,
    )

    return UserRead.model_validate(user)
