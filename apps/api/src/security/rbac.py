"""
RBAC - Permission Checker, Dependencies & Exceptions

This is the ONE file for all authorization logic.

Permission format in DB: "resource:action:scope" (3-part).
Callers pass "resource:action" (2-part) + context (resource_owner_id).
The checker determines which scope applies.
"""

from __future__ import annotations

import logging
import time
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session, select

from src.infra.db.session import get_db_session

logger = logging.getLogger(__name__)

# ============================================================================
# Exceptions
# ============================================================================


class PermissionDenied(HTTPException):
    """403 - user lacks required RBAC permission."""

    def __init__(
        self,
        permission: str | None = None,
        *,
        reason: str | None = None,
    ) -> None:
        message = (
            f"Permission denied: {permission}" if permission else "Permission denied"
        )
        detail = {
            "error_code": "PERMISSION_DENIED",
            "message": message,
            "permission": permission,
            "reason": reason,
        }
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class AuthenticationRequired(HTTPException):
    """401 - must be logged in."""

    def __init__(self, reason: str | None = None) -> None:
        detail = {
            "error_code": "AUTHENTICATION_REQUIRED",
            "message": reason or "Not authenticated",
        }
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


class FeatureDisabled(HTTPException):
    """403 - feature is disabled (not an RBAC denial)."""

    def __init__(self, reason: str | None = None) -> None:
        detail = {
            "error_code": "FEATURE_DISABLED",
            "message": reason or "Feature is disabled",
        }
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class ResourceAccessDenied(HTTPException):
    """403 - access denied for a non-RBAC reason (e.g., attempt limit, wrong user)."""

    def __init__(self, reason: str | None = None) -> None:
        detail = {
            "error_code": "ACCESS_DENIED",
            "message": reason or "Access denied",
        }
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


# ============================================================================
# Permission Checker
# ============================================================================


class PermissionChecker:
    """
    Loads user's granted permission strings once per user within a request,
    then resolves scope from context.

    Permission format in DB: "resource:action:scope" (3-part).
    Callers pass "resource:action" (2-part) + context (resource_owner_id,
    is_assigned).  The checker determines which scope applies.

    Note: _cache is per-instance, which is per-request (see get_permission_checker).
    It deduplicates DB hits within a single request — not a cross-request cache.
    """

    def __init__(self, db: Session) -> None:
        self.db = db
        self._cache: dict[int, set[str]] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check(
        self,
        user_id: int,
        permission: str,
        *,
        resource_owner_id: int | None = None,
        is_assigned: bool = False,
    ) -> bool:
        """Return True if user has the permission.

        Args:
            user_id: The user to check.
            permission: "resource:action" (2-part). Scope is resolved from context.
            resource_owner_id: The creator/owner of the resource. Enables "own" scope.
            is_assigned: Set to True when the service layer has already verified that
                this resource is assigned to the user (e.g. course enrollment confirmed).
                Required to unlock ``assigned``-scope permissions.
        """
        granted = self._get_or_load(user_id)
        return self._resolve(
            permission, granted, user_id, resource_owner_id, is_assigned
        )

    def require(
        self,
        user_id: int,
        permission: str,
        *,
        resource_owner_id: int | None = None,
        is_assigned: bool = False,
    ) -> None:
        """check() + raise PermissionDenied when False."""
        if not self.check(
            user_id,
            permission,
            resource_owner_id=resource_owner_id,
            is_assigned=is_assigned,
        ):
            raise PermissionDenied(permission=permission)

    def check_many(self, user_id: int, permissions: list[str]) -> dict[str, bool]:
        """Batch check. Returns dict of permission -> granted.

        Checks if user has the permission at ANY scope. Used by frontend
        for UI state ("can this user do X at all?").
        """
        granted = self._get_or_load(user_id)
        results = {}
        for p in permissions:
            parts = p.split(":")
            if len(parts) != 2:
                results[p] = False
                continue
            resource, action = parts
            results[p] = any(
                self._has_perm(granted, resource, action, scope)
                for scope in ("all", "platform", "assigned", "own")
            )
        return results

    def get_effective_permissions(self, user_id: int) -> set[str]:
        """Return the raw set of granted permission strings (3-part)."""
        return self._get_or_load(user_id)

    def get_expanded_permissions(self, user_id: int) -> set[str]:
        """Return permissions with wildcards expanded to explicit strings.

        The frontend does exact Set.has() lookups, so wildcards like ``*:*:*``
        or ``course:*:platform`` must be expanded into every concrete
        ``resource:action:scope`` combination they cover.
        """
        from src.db.permission_enums import Action, ResourceType, Scope

        raw = self._get_or_load(user_id)
        expanded: set[str] = set()

        all_resources = [r.value for r in ResourceType]
        all_actions = [a.value for a in Action]
        all_scopes = [s.value for s in Scope]

        for perm_str in raw:
            parts = perm_str.split(":")
            if len(parts) != 3:
                expanded.add(perm_str)
                continue

            res, act, scp = parts

            resources = all_resources if res == "*" else [res]
            actions = all_actions if act == "*" else [act]
            scopes = all_scopes if scp == "*" else [scp]

            for r in resources:
                for a in actions:
                    for s in scopes:
                        expanded.add(f"{r}:{a}:{s}")

        # Scope hierarchy expansion: broader scopes imply narrower ones.
        # "all"      → also implies "platform", "assigned", "own"
        # "platform" → also implies "own"
        # This ensures the frontend's exact Set.has() lookups work correctly
        # (e.g. a user with course:update:platform also passes a check for course:update:own).
        scope_implies: dict[str, list[str]] = {
            "all": ["platform", "assigned", "own"],
            "platform": ["own"],
        }

        hierarchy_expanded: set[str] = set()
        for perm_str in expanded:
            hierarchy_expanded.add(perm_str)
            parts = perm_str.split(":")
            if len(parts) == 3:
                res, act, scp = parts
                for implied_scope in scope_implies.get(scp, []):
                    hierarchy_expanded.add(f"{res}:{act}:{implied_scope}")

        return hierarchy_expanded

    def get_user_roles(self, user_id: int) -> list[dict]:
        """Return role dicts for user."""
        from src.db.permissions import Role, UserRole

        query = (
            select(Role, UserRole)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user_id)
        )
        results = self.db.exec(query).all()
        return [
            {
                "id": role.id,
                "slug": role.slug,
                "name": role.name,
                "description": role.description,
                "is_system": role.is_system,
                "priority": role.priority,
                "created_at": role.created_at,
                "updated_at": role.updated_at,
            }
            for role, user_role in results
        ]

    # ------------------------------------------------------------------
    # Role management
    # ------------------------------------------------------------------

    def assign_role(
        self,
        user_id: int,
        role_id: int,
        *,
        assigned_by: int | None = None,
    ) -> None:
        """
        Assign a role to a user.

        Args:
            user_id: Target user ID
            role_id: Numeric role ID
            assigned_by: User ID who is assigning the role
        """
        from src.db.permissions import Role, UserRole

        role = self.db.get(Role, role_id)

        if not role:
            raise HTTPException(404, detail=f"Role not found: ID {role_id}")

        # Escalation prevention: assigner cannot grant a role with higher
        # priority than their own highest role.
        if assigned_by is not None:
            assigner_roles = self.get_user_roles(assigned_by)
            assigner_max_priority = max(
                (r["priority"] for r in assigner_roles), default=0
            )
            if role.priority > assigner_max_priority:
                raise PermissionDenied(
                    permission="role:create",
                    reason="Cannot assign a role with higher priority than your own",
                )

        existing = self.db.exec(
            select(UserRole)
            .where(UserRole.user_id == user_id)
            .where(UserRole.role_id == role.id)
        ).first()
        if existing:
            return  # idempotent

        self.db.add(
            UserRole(
                user_id=user_id,
                role_id=role.id,
                assigned_by=assigned_by,
            )
        )
        self.db.flush()
        self._cache.pop(user_id, None)

    def revoke_role(
        self,
        user_id: int,
        role_id: int,
    ) -> None:
        """
        Revoke a role from a user.

        Args:
            user_id: Target user ID
            role_id: Numeric role ID
        """
        from src.db.permissions import Role, UserRole

        role = self.db.get(Role, role_id)

        if not role:
            raise HTTPException(404, detail=f"Role not found: ID {role_id}")

        user_role = self.db.exec(
            select(UserRole)
            .where(UserRole.user_id == user_id)
            .where(UserRole.role_id == role.id)
        ).first()
        if not user_role:
            raise HTTPException(404, detail=f"Role not assigned: ID {role_id}")

        self.db.delete(user_role)
        self.db.flush()
        self._cache.pop(user_id, None)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _get_or_load(self, user_id: int) -> set[str]:
        if user_id not in self._cache:
            if user_id == 0:
                # Anonymous user — load permissions granted to the "guest" system
                # role so that public endpoints (e.g. self-registration) resolve
                # correctly through the normal RBAC path.
                self._cache[user_id] = self._load_guest_permissions()
            else:
                self._cache[user_id] = self._load_permissions(user_id)
        return self._cache[user_id]

    def _load_guest_permissions(self) -> set[str]:
        """Return the permissions assigned to the global ``guest`` system role."""
        from src.db.permissions import Permission, Role, RolePermission

        query = (
            select(Permission.name)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(Role, Role.id == RolePermission.role_id)
            .where(Role.slug == "guest")
            .distinct()
        )
        return set(self.db.exec(query).all())

    def _load_permissions(self, user_id: int) -> set[str]:
        """Single JOIN query -> set of permission name strings (3-part)."""
        from src.db.permissions import Permission, Role, RolePermission, UserRole

        query = (
            select(Permission.name)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(Role, Role.id == RolePermission.role_id)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user_id)
            .distinct()
        )

        return set(self.db.exec(query).all())

    @staticmethod
    def _has_perm(granted: set[str], resource: str, action: str, scope: str) -> bool:
        """Check if granted set contains a permission matching resource:action:scope.

        Handles wildcard patterns: resource:*:scope, *:action:scope, *:*:*, etc.
        """
        candidates = [
            f"{resource}:{action}:{scope}",
            f"{resource}:*:{scope}",
            f"*:{action}:{scope}",
            f"*:*:{scope}",
            f"{resource}:*:*",
            "*:*:*",
        ]
        return any(c in granted for c in candidates)

    @staticmethod
    def _resolve(
        permission: str,
        granted: set[str],
        user_id: int,
        resource_owner_id: int | None,
        is_assigned: bool = False,
    ) -> bool:
        """Resolve whether a 2-part permission is satisfied by the granted set.

        Checks scopes from broadest to narrowest:
        1. all      - always passes
        2. platform - passes (membership implied by loaded permissions)
        3. assigned - passes only when is_assigned=True (caller verified assignment)
        4. own      - passes if resource_owner_id == user_id
        """
        parts = permission.split(":")
        if len(parts) != 2:
            return False

        resource, action = parts

        # 1. "all" scope
        if PermissionChecker._has_perm(granted, resource, action, "all"):
            return True

        # 2. "platform" scope
        if PermissionChecker._has_perm(granted, resource, action, "platform"):
            return True

        # 3. "assigned" scope — the caller must pass is_assigned=True to confirm
        #    the service layer has verified the resource is assigned to this user
        #    (e.g. confirmed course enrollment, explicit assignment record, etc.).
        if is_assigned and PermissionChecker._has_perm(
            granted, resource, action, "assigned"
        ):
            return True

        # 4. "own" scope - user owns the resource
        if resource_owner_id is not None and resource_owner_id == user_id:
            if PermissionChecker._has_perm(granted, resource, action, "own"):
                return True

        return False


# ============================================================================
# FastAPI Dependencies
# ============================================================================


async def mark_user_roles_updated(user_uuid: str) -> None:
    """Signal that a user's roles have changed.

    Writes the current timestamp to ``roles_updated:{user_uuid}`` in Redis with
    a TTL equal to the access-token lifetime.  The next token verification will
    compare this value against the ``rvs`` claim and reject stale tokens with a
    ``roles_stale`` WWW-Authenticate error, prompting a silent refresh.

    MUST be called (awaited) by any endpoint that assigns or revokes roles after
    the DB transaction has been committed.
    """
    from src.security.auth_lifetimes import ACCESS_TOKEN_EXPIRE
    from src.services.cache.redis_client import get_async_redis_client

    r = get_async_redis_client()
    if r:
        ttl = int(ACCESS_TOKEN_EXPIRE.total_seconds())
        await r.set(
            f"roles_updated:{user_uuid}",
            str(int(time.time())),
            ex=ttl,
        )


def get_permission_checker(
    db: Session = Depends(get_db_session),
) -> PermissionChecker:
    """FastAPI dependency returning a PermissionChecker for this request."""
    return PermissionChecker(db)


PermissionCheckerDep = Annotated[PermissionChecker, Depends(get_permission_checker)]


class RequirePermission:
    """Declarative permission dependency for FastAPI routes.

    Usage::

        @router.post("/", dependencies=[Depends(RequirePermission("role:create"))])
        async def create_role(...):
            ...

    Note: ``get_current_user`` is imported lazily inside ``__call__`` to
    avoid a circular import with ``src.security.auth``.
    """

    def __init__(self, permission: str) -> None:
        self.permission = permission

    async def __call__(
        self,
        request: Request,
        checker: PermissionCheckerDep,
    ) -> None:
        from src.db.users import AnonymousUser
        from src.security.auth import (
            get_access_token_from_request,
            get_current_user_from_token,
        )

        header_value = request.headers.get("Authorization", "")
        header_token = None
        if header_value.startswith("Bearer "):
            header_token = header_value.removeprefix("Bearer ").strip()

        token = get_access_token_from_request(request, header_token)
        if not token:
            raise AuthenticationRequired

        current_user = await get_current_user_from_token(
            request=request,
            token=token,
            db_session=checker.db,
        )
        if isinstance(current_user, AnonymousUser):
            raise AuthenticationRequired

        checker.require(current_user.id, self.permission)
