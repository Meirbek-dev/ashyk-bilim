"""
Roles Router - CRUD for roles + permission assignment.

Role assignment/revocation to *users* is in rbac.py.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from src.db.permissions import PermissionRead, RoleCreate, RoleRead, RoleUpdate
from src.db.users import PublicUser
from src.repositories.role_repository import RoleRepositoryDep
from src.routers.role_audit_store import (
    RoleAuditListResponse,
    append_role_audit_event,
    list_role_audit_events,
)
from src.security.auth import get_current_user
from src.security.rbac import PermissionChecker, PermissionCheckerDep

audit_log = logging.getLogger("rbac.audit")

router = APIRouter()


class AddPermissionBody(BaseModel):
    permission_id: int


def _caller_max_priority(checker: PermissionChecker, user_id: int) -> int:
    return max((r["priority"] for r in checker.get_user_roles(user_id)), default=0)


# ── List / Read ───────────────────────────────────────────────────────────────


@router.get("/permissions/all", response_model=list[PermissionRead])
def list_all_permissions(
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    repo: RoleRepositoryDep,
):
    """List all permission definitions. Used by the RBAC admin panel."""
    checker.require(current_user.id, "role:read")
    return [PermissionRead.model_validate(p) for p in repo.list_all_permissions()]


@router.get("", response_model=list[RoleRead])
def list_roles(
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    repo: RoleRepositoryDep,
):
    """List all roles available in the platform."""
    checker.require(current_user.id, "role:read")
    roles = repo.list_all()
    role_ids = [r.id for r in roles if r.id is not None]
    perm_map, user_map = repo.bulk_counts(role_ids) if role_ids else ({}, {})
    return [
        RoleRead.model_validate(r).model_copy(
            update={
                "permissions_count": perm_map.get(r.id or 0, 0),
                "users_count": user_map.get(r.id or 0, 0),
            }
        )
        for r in roles
    ]


@router.get("/audit-log", response_model=RoleAuditListResponse)
def get_role_audit_log(
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    checker.require(current_user.id, "role:read")
    events = list_role_audit_events()
    total = len(events)
    start = (page - 1) * page_size
    return RoleAuditListResponse(
        items=events[start : start + page_size],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{role_id}", response_model=RoleRead)
def get_role(
    role_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    repo: RoleRepositoryDep,
):
    """Get a single role by ID."""
    checker.require(current_user.id, "role:read")
    role = repo.get_or_404(role_id)
    perm_count, user_count = repo.get_counts(role_id)
    return RoleRead.model_validate(role).model_copy(
        update={"permissions_count": perm_count, "users_count": user_count}
    )


# ── Create / Update / Delete ──────────────────────────────────────────────────


@router.post("", response_model=RoleRead)
def create_role(
    body: RoleCreate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    repo: RoleRepositoryDep,
):
    """Create a new custom role."""
    checker.require(current_user.id, "role:create")
    if body.priority > _caller_max_priority(checker, current_user.id):
        raise HTTPException(
            403, detail="Cannot create a role with higher priority than your own"
        )
    role = repo.create_role(body)
    audit_log.info(
        "role_created",
        extra={"actor_id": current_user.id, "role_id": role.id, "role_slug": role.slug},
    )
    append_role_audit_event(
        actor_id=current_user.id,
        action="role_created",
        target_role_id=role.id,
        target_role_slug=role.slug,
    )
    return RoleRead.model_validate(role)


@router.put("/{role_id}", response_model=RoleRead)
def update_role(
    role_id: int,
    body: RoleUpdate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    repo: RoleRepositoryDep,
):
    """Update a role's name, description, or priority."""
    checker.require(current_user.id, "role:update")
    role = repo.get_or_404(role_id)
    is_admin = checker.check(current_user.id, "role:manage")
    if role.is_system and not is_admin:
        raise HTTPException(403, detail="System roles cannot be modified")
    requested_priority = body.priority if body.priority is not None else role.priority
    if not is_admin and requested_priority > _caller_max_priority(
        checker, current_user.id
    ):
        raise HTTPException(
            403, detail="Cannot set a role priority higher than your own"
        )
    role, changed = repo.update_role(role, body)
    audit_log.info(
        "role_updated",
        extra={
            "actor_id": current_user.id,
            "role_id": role_id,
            "fields": list(changed.keys()),
        },
    )
    append_role_audit_event(
        actor_id=current_user.id,
        action="role_updated",
        target_role_id=role_id,
        target_role_slug=role.slug,
        diff_summary=", ".join(changed.keys()) if changed else None,
    )
    return RoleRead.model_validate(role)


@router.delete("/{role_id}")
def delete_role(
    role_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    repo: RoleRepositoryDep,
):
    """Delete a custom role."""
    checker.require(current_user.id, "role:delete")
    role = repo.get_or_404(role_id)
    is_admin = checker.check(current_user.id, "role:manage")
    if role.is_system and not is_admin:
        raise HTTPException(403, detail="System roles cannot be deleted")
    audit_log.info(
        "role_deleted",
        extra={
            "actor_id": current_user.id,
            "role_id": role_id,
            "role_slug": role.slug,
        },
    )
    append_role_audit_event(
        actor_id=current_user.id,
        action="role_deleted",
        target_role_id=role_id,
        target_role_slug=role.slug,
    )
    repo.delete_role(role)
    return {"ok": True}


@router.get("/{role_id}/users/count")
def get_role_users_count(
    role_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    repo: RoleRepositoryDep,
):
    checker.require(current_user.id, "role:read")
    repo.get_or_404(role_id)  # 404 guard
    return {"count": repo.get_user_count(role_id)}


# ── Permissions on Roles ──────────────────────────────────────────────────────


@router.get("/{role_id}/permissions", response_model=list[PermissionRead])
def get_role_permissions(
    role_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    repo: RoleRepositoryDep,
):
    """Get all permissions assigned to a role."""
    checker.require(current_user.id, "role:read")
    repo.get_or_404(role_id)
    return [
        PermissionRead.model_validate(p) for p in repo.get_role_permissions(role_id)
    ]


@router.post("/{role_id}/permissions")
def add_permission_to_role(
    role_id: int,
    body: AddPermissionBody,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    repo: RoleRepositoryDep,
):
    """Add a permission to a role."""
    checker.require(current_user.id, "role:update")
    role = repo.get_or_404(role_id)
    is_admin = checker.check(current_user.id, "role:manage")
    if role.is_system and not is_admin:
        raise HTTPException(403, detail="System roles cannot be modified")
    perm = repo.get_permission_or_404(body.permission_id)
    if not is_admin and perm.name not in checker.get_expanded_permissions(
        current_user.id
    ):
        raise HTTPException(
            403,
            detail=f"Cannot grant permission '{perm.name}' that you do not have",
        )
    repo.add_permission_to_role(role_id, body.permission_id)
    audit_log.info(
        "permission_added_to_role",
        extra={
            "actor_id": current_user.id,
            "role_id": role_id,
            "permission_id": body.permission_id,
            "permission_name": perm.name,
        },
    )
    append_role_audit_event(
        actor_id=current_user.id,
        action="permission_added_to_role",
        target_role_id=role_id,
        target_role_slug=role.slug,
        diff_summary=perm.name,
    )
    return {"ok": True}


@router.delete("/{role_id}/permissions/{permission_id}")
def remove_permission_from_role(
    role_id: int,
    permission_id: int,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    checker: PermissionCheckerDep,
    repo: RoleRepositoryDep,
):
    """Remove a permission from a role."""
    checker.require(current_user.id, "role:update")
    role = repo.get_or_404(role_id)
    is_admin = checker.check(current_user.id, "role:manage")
    if role.is_system and not is_admin:
        raise HTTPException(403, detail="System roles cannot be modified")
    perm = repo.remove_permission_from_role(role_id, permission_id)
    audit_log.info(
        "permission_removed_from_role",
        extra={
            "actor_id": current_user.id,
            "role_id": role_id,
            "permission_id": permission_id,
        },
    )
    append_role_audit_event(
        actor_id=current_user.id,
        action="permission_removed_from_role",
        target_role_id=role_id,
        target_role_slug=role.slug,
        diff_summary=perm.name if perm else None,
    )
    return {"ok": True}
