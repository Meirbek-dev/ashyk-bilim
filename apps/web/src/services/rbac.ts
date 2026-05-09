/**
 * Unified RBAC service - single file for all permission and role API calls.
 *
 * Every RBAC-related fetch in the frontend should go through this module.
 * No inline fetch() calls for roles/permissions anywhere else.
 */

import type {
  CreateRoleBody,
  UserBasic,
  Permission,
  Role,
  RoleAuditListResponse,
  UpdateRoleBody,
  UserRBACData,
  UserRoleAssignment,
} from '@/types/permissions';
import { apiFetch } from '@/lib/api-client';

// ============================================================================
// Internal helpers
// ============================================================================

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set('Content-Type', 'application/json');

  const res = await apiFetch(path, {
    method: options?.method,
    body: options?.body,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `RBAC API error: ${res.status}`);
  }

  return res.json();
}

// ============================================================================
// My permissions
// ============================================================================

export function fetchMyPermissions(): Promise<UserRBACData> {
  return request('rbac/me/permissions');
}

// ============================================================================
// Permissions - read-only
// ============================================================================

export function listAllPermissions(): Promise<Permission[]> {
  return request('roles/permissions/all');
}

// ============================================================================
// Roles - CRUD
// ============================================================================

export function listRoles(): Promise<Role[]> {
  return request('roles');
}

export function getRole(roleId: number): Promise<Role> {
  return request(`roles/${roleId}`);
}

export function getRolePermissions(roleId: number): Promise<Permission[]> {
  return request(`roles/${roleId}/permissions`);
}

export function createRole(body: CreateRoleBody): Promise<Role> {
  return request('roles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateRole(roleId: number, body: UpdateRoleBody): Promise<Role> {
  return request(`roles/${roleId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteRole(roleId: number): Promise<void> {
  return request(`roles/${roleId}`, { method: 'DELETE' });
}

export function getRoleUsersCount(roleId: number): Promise<{ count: number }> {
  return request(`roles/${roleId}/users/count`);
}

export function listRoleAuditLog(page = 1, pageSize = 20): Promise<RoleAuditListResponse> {
  return request(`roles/audit-log?page=${page}&page_size=${pageSize}`);
}

// ============================================================================
// Role ↔ Permission assignment
// ============================================================================

export function addPermissionToRole(roleId: number, permissionId: number): Promise<void> {
  return request(`roles/${roleId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ permission_id: permissionId }),
  });
}

export function removePermissionFromRole(roleId: number, permissionId: number): Promise<void> {
  return request(`roles/${roleId}/permissions/${permissionId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// User ↔ Role assignment
// ============================================================================

export function listUserRoles(): Promise<UserRoleAssignment[]> {
  return request<UserRoleAssignment[]>('rbac/user-roles');
}

export function assignRoleToUser(userId: number, roleId: number): Promise<void> {
  return request('rbac/roles/assign', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, role_id: roleId }),
  });
}

export function removeRoleFromUser(userId: number, roleId: number): Promise<void> {
  return request('rbac/roles/revoke', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, role_id: roleId }),
  });
}

// ============================================================================
// Users (used by role assignment UI)
// ============================================================================

export function listUsers(limit = 100): Promise<UserBasic[]> {
  return request<UserBasic[] | { users: UserBasic[] }>(`members?limit=${limit}`).then((data) =>
    Array.isArray(data) ? data : data.users,
  );
}
