"""
RBAC Database Models & API Schemas

Single source of truth for all permission-related tables and Pydantic models.
"""

from datetime import UTC, datetime

from pydantic import ConfigDict, field_validator
from sqlalchemy import Column, ForeignKey, Index, Integer, UniqueConstraint
from sqlmodel import Field

# ============================================================================
# Enums - generated from shared/permissions.yaml
# ============================================================================
# These are imported from the generated file and re-exported here
# so the entire codebase can do: from src.db.permissions import Action, ResourceType, ...
from src.db.permission_enums import (
    SYSTEM_ROLES,
    Action,
    ResourceType,
    RoleSlug,
    Scope,
)
from src.db.strict_base_model import PydanticStrictBaseModel, SQLModelStrictBaseModel

# ============================================================================
# Permission Table
# ============================================================================


class Permission(SQLModelStrictBaseModel, table=True):
    """Permission definition. Each row is a {resource}:{action}:{scope} triple."""

    __tablename__ = "permissions"
    __table_args__ = (
        Index("idx_permissions_resource_action", "resource_type", "action"),
        Index("idx_permissions_name", "name", unique=True),
    )

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=100, description="resource:action:scope")
    resource_type: str = Field(max_length=50)
    action: str = Field(max_length=50)
    scope: str = Field(max_length=50)
    description: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @field_validator("name")
    @classmethod
    def validate_permission_format(cls, v: str) -> str:
        """Enforce 3-part 'resource:action:scope' format."""
        parts = v.split(":")
        if len(parts) != 3:
            msg = f"Permission name must be in format 'resource:action:scope', got: {v}"
            raise ValueError(msg)
        resource, action, scope = parts
        if not all([resource, action, scope]):
            msg = f"Permission name parts cannot be empty, got: {v}"
            raise ValueError(msg)
        return v


# ============================================================================
# Role Table
# ============================================================================


class Role(SQLModelStrictBaseModel, table=True):
    """Role definition."""

    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_roles_slug"),
        Index("idx_roles_slug", "slug"),
    )

    id: int | None = Field(default=None, primary_key=True)
    slug: str = Field(max_length=100)
    name: str = Field(max_length=100)
    description: str | None = Field(default=None)
    is_system: bool = Field(default=False)
    priority: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ============================================================================
# RolePermission Junction
# ============================================================================


class RolePermission(SQLModelStrictBaseModel, table=True):
    """Many-to-many: which permissions belong to which roles."""

    __tablename__ = "role_permissions"
    __table_args__ = (
        Index("idx_role_permissions_role", "role_id"),
        Index("idx_role_permissions_permission", "permission_id"),
    )

    role_id: int = Field(sa_column=Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True))
    permission_id: int = Field(
        sa_column=Column(Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)
    )
    granted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ============================================================================
# UserRole Table
# ============================================================================


class UserRole(SQLModelStrictBaseModel, table=True):
    """Which users have which roles."""

    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
        Index("idx_user_roles_user_role", "user_id", "role_id"),
        Index("idx_user_roles_role", "role_id"),
    )

    id: int | None = Field(
        default=None,
        sa_column=Column(Integer, primary_key=True, autoincrement=True),
    )
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    role_id: int = Field(sa_column=Column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False))
    assigned_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    assigned_by: int | None = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL")),
    )


# ============================================================================
# Pydantic API Schemas
# ============================================================================


class RoleCreate(PydanticStrictBaseModel):
    slug: str
    name: str
    description: str | None = None
    priority: int = 0


class RoleRead(PydanticStrictBaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    description: str | None = None
    is_system: bool = False
    priority: int = 0
    permissions_count: int = 0
    users_count: int = 0
    created_at: datetime
    updated_at: datetime


class RoleUpdate(PydanticStrictBaseModel):
    name: str | None = None
    description: str | None = None
    priority: int | None = None


class PermissionRead(PydanticStrictBaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    resource_type: str
    action: str
    scope: str
    description: str | None = None


# ============================================================================
# Re-exports for convenience
# ============================================================================

__all__ = [
    "SYSTEM_ROLES",
    # Enums
    "Action",
    # Tables
    "Permission",
    "PermissionRead",
    "ResourceType",
    "Role",
    # Schemas
    "RoleCreate",
    "RolePermission",
    "RoleRead",
    "RoleSlug",
    "RoleUpdate",
    "Scope",
    "UserRole",
]
