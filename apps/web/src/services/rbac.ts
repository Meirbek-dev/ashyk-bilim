/**
 * Unified RBAC service - single file for all permission and role API calls.
 *
 * Every RBAC-related fetch in the frontend should go through this module.
 * No inline network calls for roles/permissions anywhere else.
 */

import type {
  CreateRoleBody,
  Permission,
  Role,
  RoleAuditListResponse,
  UpdateRoleBody,
  UserRoleAssignment,
} from '@/types/permissions'
import type { AdminUser, AdminUserPage, Role as RbacRole } from '@/lib/api/generated/zod'
import { apiJson } from '@/lib/api-client'

// ============================================================================
// Internal helpers
// ============================================================================

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  headers.set('Content-Type', 'application/json')

  return apiJson<T>(path, {
    headers,
    ...(options?.method ? { method: options.method } : {}),
    ...(options?.body !== undefined ? { body: options.body } : {}),
  })
}

// ============================================================================
// My permissions
// ============================================================================

// ============================================================================
// Permissions - read-only
// ============================================================================

export function listAllPermissions(): Promise<Permission[]> {
  return request('roles/permissions/all')
}

// ============================================================================
// Roles - CRUD
// ============================================================================

/** All roles with their grants (`GET rbac/roles`, v2 — slug-keyed, no numeric id). */
export function listRoles(): Promise<RbacRole[]> {
  return request('rbac/roles')
}

export function getRole(roleId: number): Promise<Role> {
  return request(`roles/${roleId}`)
}

export function getRolePermissions(roleId: number): Promise<Permission[]> {
  return request(`roles/${roleId}/permissions`)
}

export function createRole(body: CreateRoleBody): Promise<Role> {
  return request('roles', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateRole(roleId: number, body: UpdateRoleBody): Promise<Role> {
  return request(`roles/${roleId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function deleteRole(roleId: number): Promise<void> {
  return request(`roles/${roleId}`, { method: 'DELETE' })
}

export function listRoleAuditLog(page = 1, pageSize = 20): Promise<RoleAuditListResponse> {
  return request(`roles/audit-log?page=${page}&page_size=${pageSize}`)
}

// ============================================================================
// Role ↔ Permission assignment
// ============================================================================

export function addPermissionToRole(roleId: number, permissionId: number): Promise<void> {
  return request(`roles/${roleId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ permission_id: permissionId }),
  })
}

export function removePermissionFromRole(roleId: number, permissionId: number): Promise<void> {
  return request(`roles/${roleId}/permissions/${permissionId}`, {
    method: 'DELETE',
  })
}

// ============================================================================
// User ↔ Role assignment
// ============================================================================

export function listUserRoles(): Promise<UserRoleAssignment[]> {
  return request<UserRoleAssignment[]>('rbac/user-roles')
}

/** `POST users/{id}/roles` (v2) — body carries the role slug, not a numeric role id. */
export function assignRoleToUser(userId: string, slug: string): Promise<void> {
  return request(`users/${userId}/roles`, {
    method: 'POST',
    body: JSON.stringify({ role: slug }),
  })
}

/** `DELETE users/{id}/roles/{slug}` (v2). */
export function removeRoleFromUser(userId: string, slug: string): Promise<void> {
  return request(`users/${userId}/roles/${slug}`, { method: 'DELETE' })
}

// ============================================================================
// Users (used by role assignment UI)
// ============================================================================

/** Admin user listing (`GET users`, v2 — `/members` is banned). */
export function listUsers(limit = 100): Promise<AdminUser[]> {
  return request<AdminUserPage>(`users?limit=${limit}`).then(page => page.items)
}
