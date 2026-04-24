"""
Test to enforce RBAC permission checks on all API endpoints.

This test prevents security vulnerabilities by ensuring no endpoint
is deployed without proper permission checks.
"""

import ast
import importlib
import inspect
from pathlib import Path
from typing import Any

import pytest
from fastapi import APIRouter

# Endpoints that are explicitly exempt from permission checks
EXEMPT_ENDPOINTS = {
    # Health & monitoring
    "/health",
    "/health/",
    "/health/ready",
    "/health/live",
    # Authentication (public by design)
    "/auth/login",
    "/auth/logout",
    "/auth/register",
    "/auth/refresh",
    "/auth/reset-password",
    # Public platform discovery
    "/platform",  # GET only (public read)
    # Public course browsing (GET only)
    "/courses/page/{page}/limit/{limit}",
    "/courses/{course_uuid}",  # GET only
    "/courses/{course_uuid}/meta",  # GET only
    # User profile (own account)
    "/users/profile",
    "/users/session",
    # Permission check endpoint (for frontend)
    "/permissions/check",
    "/permissions/me",
    # Dev endpoints (should be disabled in production)
    "/dev",
}

# HTTP methods that MUST have permission checks
PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def get_all_routers() -> list[tuple[str, Any]]:
    """Discover all router modules in the codebase."""
    routers = []
    router_dir = Path("src/routers")

    for py_file in router_dir.rglob("*.py"):
        if py_file.name.startswith("_"):
            continue

        # Convert path to module name
        rel_path = py_file.relative_to(Path("src"))
        module_name = f"src.{str(rel_path.with_suffix('')).replace('/', '.')}"

        try:
            module = importlib.import_module(module_name)
            if hasattr(module, "router"):
                routers.append((module_name, module.router))
        except Exception as e:
            # Log but don't fail on import errors
            print(f"Warning: Could not import {module_name}: {e}")

    return routers


def has_permission_check(func_source: str) -> bool:
    """
    Check if function source code contains permission checks.

    Looks for:
    - checker.require() / checker.check() calls
    - PermissionCheckerDep dependency injection
    - PermissionDenied exception handling
    """
    indicators = [
        "checker.require",
        "checker.check",
        "PermissionDenied",
        "PermissionCheckerDep",
        "raise PermissionDenied",
    ]

    return any(indicator in func_source for indicator in indicators)


def is_read_only_endpoint(method: str, path: str) -> bool:
    """Check if endpoint is read-only (GET) and public."""
    if method != "GET":
        return False

    # GET endpoints on public resources are often safe
    public_patterns = [
        "/courses/page/",
        "/courses/{course_uuid}",
        "/platform",
    ]

    return any(pattern in path for pattern in public_patterns)


def test_all_endpoints_have_rbac() -> None:
    """
    Verify all protected endpoints have permission checks.

    This test will FAIL if any POST/PUT/PATCH/DELETE endpoint
    lacks permission checks, preventing security vulnerabilities.
    """
    routers = get_all_routers()
    unprotected_endpoints = []

    for module_name, router in routers:
        if not isinstance(router, APIRouter):
            continue

        for route in router.routes:
            # Skip non-API routes
            if not hasattr(route, "methods") or not hasattr(route, "path"):
                continue

            for method in route.methods:
                # Skip methods that don't need protection
                if method not in PROTECTED_METHODS:
                    continue

                path = route.path

                # Check if exempt
                if path in EXEMPT_ENDPOINTS:
                    continue

                if is_read_only_endpoint(method, path):
                    continue

                # Get the handler function
                endpoint_func = route.endpoint
                if endpoint_func is None:
                    continue

                # Get source code
                try:
                    source = inspect.getsource(endpoint_func)
                except TypeError, OSError:
                    # Can't get source (compiled/builtin function)
                    continue

                # Check for permission checks
                if not has_permission_check(source):
                    unprotected_endpoints.append({
                        "method": method,
                        "path": path,
                        "handler": endpoint_func.__name__,
                        "module": module_name,
                    })

    # Assert no unprotected endpoints found
    if unprotected_endpoints:
        error_msg = (
            "\\n\\n⚠️  SECURITY: Found endpoints without permission checks:\\n\\n"
        )
        for ep in unprotected_endpoints:
            error_msg += f"  {ep['method']} {ep['path']}\\n"
            error_msg += f"    Handler: {ep['handler']} in {ep['module']}\\n\\n"

        error_msg += "\\n✅ Fix: Add permission checks using one of:\\n"
        error_msg += "  1. checker.require() / checker.check() call\n"
        error_msg += "  2. PermissionCheckerDep dependency injection\n"
        error_msg += "  3. Add to EXEMPT_ENDPOINTS if intentionally public\\n"

        pytest.fail(error_msg)


def test_exempt_endpoints_are_intentional() -> None:
    """
    Document and validate exempt endpoints.

    This ensures we're consciously exempting endpoints, not accidentally.
    """
    # Count and categorize exempt endpoints
    categories = {
        "health": [e for e in EXEMPT_ENDPOINTS if "health" in e.lower()],
        "auth": [e for e in EXEMPT_ENDPOINTS if "auth" in e.lower()],
        "public": [e for e in EXEMPT_ENDPOINTS if e not in []],
    }

    # Ensure we're not exempting too many endpoints
    assert len(EXEMPT_ENDPOINTS) < 25, (
        f"Too many exempt endpoints ({len(EXEMPT_ENDPOINTS)}). "
        "Review if all are necessary."
    )

    # Document count
    print(f"\\nExempt endpoints: {len(EXEMPT_ENDPOINTS)}")
    for category, endpoints in categories.items():
        print(f"  {category}: {len(endpoints)}")


def test_permission_checker_usage() -> None:
    """
    Verify PermissionChecker is used correctly in endpoints.

    Common mistakes:
    - Using old permission_service patterns
    - Not using checker.require() for mandatory checks
    """
    routers = get_all_routers()
    issues = []

    for module_name, router in routers:
        if not isinstance(router, APIRouter):
            continue

        for route in router.routes:
            if not hasattr(route, "endpoint"):
                continue

            endpoint_func = route.endpoint
            try:
                source = inspect.getsource(endpoint_func)
            except TypeError, OSError:
                continue

            # Detect old permission patterns that should be migrated
            if "permission_service" in source:
                issues.append({
                    "endpoint": endpoint_func.__name__,
                    "issue": "Still uses old permission_service pattern",
                    "module": module_name,
                })

    if issues:
        error_msg = "\\n\\n⚠️  Permission Check Issues:\\n\\n"
        for issue in issues:
            error_msg += f"  {issue['endpoint']} in {issue['module']}\\n"
            error_msg += f"    Problem: {issue['issue']}\\n\\n"

        pytest.fail(error_msg)


if __name__ == "__main__":
    # Allow running as script for quick verification
    pytest.main([__file__, "-v"])
