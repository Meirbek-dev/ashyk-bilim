"""
RoleRepository — all DB operations for Role, Permission, RolePermission.

Authorization is NOT performed here; callers must call PermissionChecker.require()
before any mutating operation.  Seeding (idempotent upsert of system roles) lives
here because it requires only DB access, not per-request permission state.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from src.db.permissions import (
    Permission,
    Role,
    RoleCreate,
    RolePermission,
    RoleUpdate,
    UserRole,
)
from src.infra.db.session import get_db_session


class RoleRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Read helpers ──────────────────────────────────────────────────────

    def get_or_404(self, role_id: int) -> Role:
        role = self.db.get(Role, role_id)
        if not role:
            raise HTTPException(404, detail="Role not found")
        return role

    def get_permission_or_404(self, permission_id: int) -> Permission:
        perm = self.db.get(Permission, permission_id)
        if not perm:
            raise HTTPException(404, detail="Permission not found")
        return perm

    def list_all(self) -> list[Role]:
        return self.db.exec(select(Role).order_by(Role.priority.desc())).all()

    def list_all_permissions(self) -> list[Permission]:
        return self.db.exec(
            select(Permission).order_by(Permission.resource_type, Permission.action)
        ).all()

    def get_role_permissions(self, role_id: int) -> list[Permission]:
        return self.db.exec(
            select(Permission)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role_id)
        ).all()

    def bulk_counts(self, role_ids: list[int]) -> tuple[dict[int, int], dict[int, int]]:
        """Return (permission_count_map, user_count_map) for a list of role IDs."""
        perm_rows = self.db.exec(
            select(RolePermission.role_id, func.count(RolePermission.permission_id))
            .where(RolePermission.role_id.in_(role_ids))
            .group_by(RolePermission.role_id)
        ).all()
        user_rows = self.db.exec(
            select(UserRole.role_id, func.count(UserRole.user_id))
            .where(UserRole.role_id.in_(role_ids))
            .group_by(UserRole.role_id)
        ).all()
        return dict(perm_rows), dict(user_rows)

    def get_counts(self, role_id: int) -> tuple[int, int]:
        """Return (permissions_count, users_count) for a single role."""
        perm_count = (
            self.db.exec(
                select(func.count(RolePermission.permission_id)).where(
                    RolePermission.role_id == role_id
                )
            ).one()
            or 0
        )
        user_count = (
            self.db.exec(
                select(func.count(UserRole.user_id)).where(UserRole.role_id == role_id)
            ).one()
            or 0
        )
        return perm_count, user_count

    def get_user_count(self, role_id: int) -> int:
        return (
            self.db.exec(
                select(func.count(UserRole.user_id)).where(UserRole.role_id == role_id)
            ).one()
            or 0
        )

    # ── Mutations ─────────────────────────────────────────────────────────

    def create_role(self, body: RoleCreate) -> Role:
        role = Role(
            slug=body.slug,
            name=body.name,
            description=body.description,
            priority=body.priority,
            is_system=False,
        )
        self.db.add(role)
        self.db.commit()
        self.db.refresh(role)
        return role

    def update_role(self, role: Role, body: RoleUpdate) -> tuple[Role, dict]:
        """Apply non-unset fields from body to role. Returns (updated_role, changed_fields)."""
        changed = body.model_dump(exclude_unset=True)
        for field, value in changed.items():
            setattr(role, field, value)
        self.db.commit()
        self.db.refresh(role)
        return role, changed

    def delete_role(self, role: Role) -> None:
        self.db.delete(role)
        self.db.commit()

    def add_permission_to_role(self, role_id: int, permission_id: int) -> None:
        existing = self.db.exec(
            select(RolePermission).where(
                RolePermission.role_id == role_id,
                RolePermission.permission_id == permission_id,
            )
        ).first()
        if existing:
            raise HTTPException(409, detail="Permission already assigned to role")
        self.db.add(RolePermission(role_id=role_id, permission_id=permission_id))
        self.db.commit()

    def remove_permission_from_role(
        self, role_id: int, permission_id: int
    ) -> Permission | None:
        """Remove permission from role. Returns the Permission row for audit logging."""
        rp = self.db.exec(
            select(RolePermission).where(
                RolePermission.role_id == role_id,
                RolePermission.permission_id == permission_id,
            )
        ).first()
        if not rp:
            raise HTTPException(404, detail="Permission not assigned to this role")
        self.db.delete(rp)
        self.db.commit()
        # Return the Permission for the caller's audit log (still in identity map)
        return self.db.get(Permission, permission_id)

    # ── Seeding ───────────────────────────────────────────────────────────

    def seed_default_roles(self) -> list[str]:
        """Create system roles & permissions from SYSTEM_ROLES. Idempotent."""
        from src.db.permission_enums import SYSTEM_ROLES

        created: list[str] = []

        for slug, role_def in SYSTEM_ROLES.items():
            role = self.db.exec(select(Role).where(Role.slug == slug)).first()
            if not role:
                role = Role(
                    slug=slug,
                    name=role_def["name"],
                    description=role_def["description"],
                    is_system=True,
                    priority=role_def["priority"],
                )
                self.db.add(role)
                self.db.flush()
                created.append(slug)

            for perm_str in role_def["permissions"]:
                parts = perm_str.split(":")
                if len(parts) != 3:
                    continue
                resource, action, scope = parts

                perm = self.db.exec(
                    select(Permission).where(Permission.name == perm_str)
                ).first()
                if not perm:
                    perm = Permission(
                        name=perm_str,
                        resource_type=resource,
                        action=action,
                        scope=scope,
                    )
                    self.db.add(perm)
                    self.db.flush()

                existing_rp = self.db.exec(
                    select(RolePermission)
                    .where(RolePermission.role_id == role.id)
                    .where(RolePermission.permission_id == perm.id)
                ).first()
                if not existing_rp:
                    self.db.add(RolePermission(role_id=role.id, permission_id=perm.id))

        self.db.commit()
        return created


# ── FastAPI dependency ────────────────────────────────────────────────────────


def get_role_repository(db: Session = Depends(get_db_session)) -> RoleRepository:
    return RoleRepository(db)


RoleRepositoryDep = Annotated[RoleRepository, Depends(get_role_repository)]
