"""
RBAC API Endpoints

- POST /check           - check single permission (returns granted/denied, never 403)
- POST /check/batch     - batch check
- GET  /me/permissions  - get current user's roles + permission strings
- POST /roles/assign    - assign role (admin)
- POST /roles/revoke    - revoke role (admin)
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlmodel import Session, select

from src.db.permissions import Role, UserRole
from src.db.users import AnonymousUser, PublicUser
from src.db.users import User as UserModel
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user
from src.security.rbac import PermissionCheckerDep

audit_log = logging.getLogger("rbac.audit")


def _rbac_rate_key(request: Request) -> str:
    auth = request.headers.get("authorization") or ""
    if auth:
        import hashlib

        h = hashlib.sha256(auth.encode("utf-8")).hexdigest()[:16]
        return f"rbac:{h}"
    return f"rbac:{get_remote_address(request)}"


limiter = Limiter(key_func=_rbac_rate_key)

router = APIRouter()


# ============================================================================
# Request / Response models
# ============================================================================


class PermissionCheckRequest(BaseModel):
    action: str
    resource: str
    resource_id: str | None = None
    scope: str | None = None


class PermissionCheckResponse(BaseModel):
    granted: bool
    permission: str


class BatchPermissionCheckRequest(BaseModel):
    checks: list[PermissionCheckRequest]


class BatchPermissionCheckResponse(BaseModel):
    results: dict[str, bool]


class RoleAssignmentRequest(BaseModel):
    """Assign a role to a user."""

    user_id: int
    role_id: int


class RoleRevocationRequest(BaseModel):
    """Revoke a role from a user."""

    user_id: int
    role_id: int


class UserPermissionsResponse(BaseModel):
    roles: list[dict]
    permissions: list[str]


class UserRoleSummary(BaseModel):
    id: int
    name: str
    slug: str
    description: str | None = None
    is_system: bool
    priority: int


class UserSummary(BaseModel):
    id: int
    email: str
    username: str
    first_name: str | None = None
    last_name: str | None = None
    avatar_image: str | None = None
    user_uuid: str | None = None


class UserRoleAssignmentResponse(BaseModel):
    user_id: int
    role_id: int
    assigned_at: str
    assigned_by: int | None = None
    user: UserSummary
    role: UserRoleSummary


# ============================================================================
# Permission check endpoints (never 403 - used by frontend for UI state)
# ============================================================================


@router.post("/check", response_model=PermissionCheckResponse)
@limiter.limit("60/minute")
def check_permission(
    request: Request,
    body: PermissionCheckRequest,
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    if isinstance(current_user, AnonymousUser):
        return PermissionCheckResponse(
            granted=False,
            permission=f"{body.resource}:{body.action}",
        )

    perm = f"{body.resource}:{body.action}"
    granted = checker.check(current_user.id, perm)
    return PermissionCheckResponse(granted=granted, permission=perm)


@router.post("/check/batch", response_model=BatchPermissionCheckResponse)
@limiter.limit("30/minute")
def check_permissions_batch(
    request: Request,
    body: BatchPermissionCheckRequest,
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    perms = [f"{c.resource}:{c.action}" for c in body.checks]

    if isinstance(current_user, AnonymousUser):
        return BatchPermissionCheckResponse(results=dict.fromkeys(perms, False))

    results = checker.check_many(current_user.id, perms)
    return BatchPermissionCheckResponse(results=results)


# ============================================================================
# Current user permissions (for frontend)
# ============================================================================


@router.get("/me/permissions", response_model=UserPermissionsResponse)
def get_my_permissions(
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
):
    if isinstance(current_user, AnonymousUser):
        return UserPermissionsResponse(roles=[], permissions=[])

    roles = checker.get_user_roles(current_user.id)
    permissions = sorted(checker.get_expanded_permissions(current_user.id))

    return UserPermissionsResponse(
        roles=roles,
        permissions=permissions,
    )


# ============================================================================
# Role assignment / revocation (admin)
# ============================================================================


@router.get("/user-roles", response_model=list[UserRoleAssignmentResponse])
def list_user_roles(
    db_session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[PublicUser, Depends(get_current_user)] = None,
    checker: PermissionCheckerDep = None,
):
    """List user↔role assignments."""
    checker.require(current_user.id, "role:read")

    rows = db_session.exec(
        select(UserRole, UserModel, Role)
        .join(UserModel, UserModel.id == UserRole.user_id)
        .join(Role, Role.id == UserRole.role_id)
        .order_by(UserRole.assigned_at.desc())
    ).all()

    return [
        UserRoleAssignmentResponse(
            user_id=user_role.user_id,
            role_id=user_role.role_id,
            assigned_at=user_role.assigned_at.isoformat(),
            assigned_by=user_role.assigned_by,
            user=UserSummary(
                id=user.id or 0,
                email=user.email,
                username=user.username,
                first_name=user.first_name,
                last_name=user.last_name,
                avatar_image=user.avatar_image,
                user_uuid=user.user_uuid,
            ),
            role=UserRoleSummary(
                id=role.id or 0,
                name=role.name,
                slug=role.slug,
                description=role.description,
                is_system=role.is_system,
                priority=role.priority,
            ),
        )
        for user_role, user, role in rows
    ]


@router.post("/roles/assign")
def assign_role(
    request: RoleAssignmentRequest,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """
    Assign a role to a user.

    **Required Permission**: `role:create`
    """
    checker.require(current_user.id, "role:create")

    checker.assign_role(
        user_id=request.user_id,
        role_id=request.role_id,
        assigned_by=current_user.id,
    )
    db_session.commit()
    audit_log.info(
        "role_assigned",
        extra={
            "actor_id": current_user.id,
            "target_user_id": request.user_id,
            "role_id": request.role_id,
        },
    )
    return {"message": "Role assigned"}


@router.post("/roles/revoke")
def revoke_role(
    request: RoleRevocationRequest,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    db_session: Annotated[Session, Depends(get_db_session)],
):
    """
    Revoke a role from a user.

    **Required Permission**: `role:delete`
    """
    checker.require(current_user.id, "role:delete")

    checker.revoke_role(
        user_id=request.user_id,
        role_id=request.role_id,
    )
    db_session.commit()
    audit_log.info(
        "role_revoked",
        extra={
            "actor_id": current_user.id,
            "target_user_id": request.user_id,
            "role_id": request.role_id,
        },
    )
    return {"message": "Role revoked"}
