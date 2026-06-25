import logging
from typing import TYPE_CHECKING

from fastapi import HTTPException
from sqlalchemy import text
from sqlmodel import Session, select
from ulid import ULID

from config.config import secret_value
from src.core.platform import PLATFORM_BRAND_NAME, PLATFORM_DESCRIPTION, PLATFORM_LABEL
from src.core.timezone import utcnow
from src.db.permission_enums import RoleSlug
from src.db.platform import Platform, PlatformCreate
from src.db.users import User, UserCreate, UserRead
from src.repositories.role_repository import RoleRepository
from src.security.rbac import PermissionChecker
from src.security.security import security_hash_password
from src.types import require_persisted_id

if TYPE_CHECKING:
    from src.infra.settings import AppSettings

logger = logging.getLogger(__name__)


def _lock_platform_table_for_bootstrap(db_session: Session) -> None:
    bind = db_session.get_bind()
    if bind.dialect.name == "postgresql":
        db_session.connection().execute(text("LOCK TABLE platform IN SHARE ROW EXCLUSIVE MODE"))


def _bootstrap_platform_email(settings: "AppSettings") -> str:
    return str(
        settings.general_config.contact_email
        or settings.mailing_config.system_email_address
        or settings.bootstrap.initial_admin_email
        or "contact@example.com"
    )


def ensure_bootstrap_state(settings: "AppSettings", db_session: Session) -> None:
    """Install seed data required by an already-migrated application database."""
    created_roles = RoleRepository(db_session).seed_default_roles()
    if created_roles:
        logger.info("Seeded default roles: %s", ", ".join(created_roles))

    _lock_platform_table_for_bootstrap(db_session)
    platform_record = db_session.exec(select(Platform)).first()
    if not platform_record:
        platform_record = Platform(
            name=PLATFORM_BRAND_NAME,
            description=PLATFORM_DESCRIPTION,
            about=f"{PLATFORM_BRAND_NAME} - online learning platform",
            email=_bootstrap_platform_email(settings),
            logo_image="",
            thumbnail_image="",
            label=PLATFORM_LABEL,
            creation_date=utcnow(),
            update_date=utcnow(),
        )
        db_session.add(platform_record)
        db_session.commit()
        logger.info("Created default platform row during startup bootstrap")

    admin_email = settings.bootstrap.initial_admin_email
    admin_password = secret_value(settings.bootstrap.initial_admin_password)
    if not admin_email or not admin_password:
        return

    existing_admin = db_session.exec(select(User).where(User.email == str(admin_email))).first()
    if existing_admin:
        return

    install_create_platform_user(
        UserCreate(
            username="Admin",
            email=str(admin_email),
            password=admin_password,
        ),
        db_session,
    )
    logger.info("Created initial admin user from bootstrap environment")


# Install Default roles
def install_default_elements(db_session: Session) -> bool:
    """Install default elements including system roles and permissions."""
    created_roles = RoleRepository(db_session).seed_default_roles()
    return len(created_roles) > 0


# Platform creation
def install_create_platform(platform_object: PlatformCreate, db_session: Session) -> Platform:
    platform_record = Platform.model_validate(platform_object)

    # Complete the platform object
    current_time = utcnow()
    platform_record.creation_date = current_time
    platform_record.update_date = current_time

    db_session.add(platform_record)
    db_session.commit()
    db_session.refresh(platform_record)

    return platform_record


def install_create_platform_user(user_object: UserCreate, db_session: Session) -> UserRead:
    user = User.model_validate(user_object)

    # Complete the user object
    user.user_uuid = f"user_{ULID()}"
    user.hashed_password = security_hash_password(user_object.password)

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

    admin_role = db_session.exec(select(Role).where(Role.slug == RoleSlug.ADMIN)).first()
    if not admin_role:
        raise HTTPException(500, detail="Admin role not found")

    # Link user to platform by assigning admin role
    checker = PermissionChecker(db_session)
    checker.assign_role(
        user_id=user.id or 0,
        role_id=require_persisted_id(admin_role.id, model_name="Role"),
    )

    return UserRead.model_validate(user)
