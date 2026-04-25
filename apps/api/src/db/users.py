import uuid as uuid_lib
from datetime import UTC, datetime

from pydantic import ConfigDict, EmailStr
from sqlalchemy import JSON, Column, DateTime, UniqueConstraint, func
from sqlmodel import Field

from src.db.permissions import RoleRead
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel


class UserBase(SQLModelStrictBaseModel):
    username: str
    first_name: str
    middle_name: str | None = ""
    last_name: str
    email: EmailStr
    avatar_image: str | None = ""
    bio: str | None = ""
    details: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    profile: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    theme: str | None = "default"
    locale: str | None = "ru-RU"


class UserCreate(UserBase):
    first_name: str = ""
    middle_name: str | None = ""
    last_name: str = ""
    password: str


class UserUpdate(SQLModelStrictBaseModel):
    username: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    avatar_image: str | None = None
    bio: str | None = None
    details: dict | None = None
    profile: dict | None = None
    theme: str | None = None
    locale: str | None = None


class UserUpdatePassword(SQLModelStrictBaseModel):
    old_password: str
    new_password: str


class UserRead(UserBase):
    id: int
    user_uuid: str
    auth_provider: str = "local"


class PublicUser(UserRead):
    pass


class UserSessionRole(PydanticStrictBaseModel):
    role: RoleRead
    model_config = ConfigDict(arbitrary_types_allowed=True)


class UserSession(PydanticStrictBaseModel):
    user: UserRead
    roles: list[UserSessionRole]
    permissions: list[
        str
    ] = []  # Effective permissions: list of permission strings, e.g. "course:create:platform"
    permissions_timestamp: int | None = (
        None  # Unix timestamp when permissions were loaded
    )
    expires_at: int | None = None
    session_version: int | None = None
    model_config = ConfigDict(arbitrary_types_allowed=True)


class AnonymousUser(SQLModelStrictBaseModel):
    id: int = 0
    user_uuid: str = "user_anonymous"
    username: str = "anonymous"
    email: str | None = "anonymous@example.com"


class InternalUser(SQLModelStrictBaseModel):
    id: int = 0
    user_uuid: str = "user_internal"
    username: str = "internal"


class User(UserBase, table=True):
    __table_args__ = (
        UniqueConstraint("username", name="uq_user_username"),
        UniqueConstraint("email", name="uq_user_email"),
        UniqueConstraint("user_uuid", name="uq_user_user_uuid"),
    )

    id: int | None = Field(default=None, primary_key=True)
    # fastapi-users required fields
    hashed_password: str | None = Field(default=None)
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    is_verified: bool = Field(default=False)

    user_uuid: str = Field(
        default_factory=lambda: f"user_{uuid_lib.uuid4().hex[:26]}",
    )
    auth_provider: str = Field(default="local")
    google_sub: str | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
        ),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
            onupdate=func.now(),
        ),
    )
