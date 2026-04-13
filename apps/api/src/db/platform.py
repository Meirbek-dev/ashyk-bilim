from pydantic import ConfigDict
from sqlalchemy import JSON, Column
from sqlmodel import Field

from src.db.permissions import RoleRead
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel
from src.db.users import UserRead


class PlatformBase(SQLModelStrictBaseModel):
    """Base model for the platform with common fields."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str
    description: str | None = None
    about: str | None = None
    socials: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    links: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    logo_image: str | None = None
    thumbnail_image: str | None = None
    previews: dict | None = Field(default_factory=dict, sa_column=Column(JSON))
    label: str | None = None
    email: str


class Platform(PlatformBase, table=True):
    """Database table model for the platform."""

    id: int | None = Field(default=None, primary_key=True)
    creation_date: str = ""
    update_date: str = ""
    landing: dict | None = Field(default_factory=dict, sa_column=Column(JSON))


class PlatformUpdate(SQLModelStrictBaseModel):
    """Model for updating the platform."""

    about: str | None = None
    socials: dict | None = None
    links: dict | None = None
    logo_image: str | None = None
    thumbnail_image: str | None = None
    previews: dict | None = None
    email: str | None = None
    update_date: str | None = None


class PlatformCreate(PlatformBase):
    """Model for creating the platform."""


class PlatformRead(PlatformBase):
    """Model for reading the platform with all related data."""

    landing: dict | None = None
    creation_date: str
    update_date: str


class PlatformUser(PydanticStrictBaseModel):
    """Model representing a user's role on the platform."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    user: UserRead
    role: RoleRead


class PaginatedPlatformUsers(PydanticStrictBaseModel):
    """Paginated response for platform users."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    users: list[PlatformUser]
    total: int
    page: int
    per_page: int
    total_pages: int
