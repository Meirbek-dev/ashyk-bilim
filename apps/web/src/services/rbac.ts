/**
 * RBAC service — every role / grant / user-status call in the frontend goes
 * through this module (v2: roles are slug-keyed, grants are
 * `resource:action:scope` strings, no numeric ids, no audit log, no
 * permission registry endpoint).
 */

import type {
  AdminUserPage,
  CreateRoleBody,
  ListUsersParams,
  Role,
  SetUserStatusBody,
  UpdateRoleBody,
} from '@/lib/api/generated/zod'
import { apiJson } from '@/lib/api-client'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  headers.set('Content-Type', 'application/json')

  return apiJson<T>(path, {
    headers,
    ...(options?.method ? { method: options.method } : {}),
    ...(options?.body !== undefined ? { body: options.body } : {}),
  })
}

// ── Roles ────────────────────────────────────────────────────────────────────

/** All roles with their grants (`GET rbac/roles`). */
export function listRoles(): Promise<Role[]> {
  return request('rbac/roles')
}

/** `POST rbac/roles` — custom role; 409 `conflict` when the slug is taken. */
export function createRole(body: CreateRoleBody): Promise<void> {
  return request('rbac/roles', { method: 'POST', body: JSON.stringify(body) })
}

/** `PATCH rbac/roles/{slug}` — custom roles only (system roles answer 404). */
export function updateRole(slug: string, body: UpdateRoleBody): Promise<void> {
  return request(`rbac/roles/${slug}`, { method: 'PATCH', body: JSON.stringify(body) })
}

/** `DELETE rbac/roles/{slug}` — custom roles only (system roles answer 403). */
export function deleteRole(slug: string): Promise<void> {
  return request(`rbac/roles/${slug}`, { method: 'DELETE' })
}

/** `PUT rbac/roles/{slug}/permissions` — full replacement of the grant set. */
export function setRolePermissions(slug: string, permissions: string[]): Promise<void> {
  return request(`rbac/roles/${slug}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) })
}

// ── User ↔ role ──────────────────────────────────────────────────────────────

/** `POST users/{id}/roles` — idempotent (204 when the user already holds it). */
export function assignRoleToUser(userId: string, slug: string): Promise<void> {
  return request(`users/${userId}/roles`, { method: 'POST', body: JSON.stringify({ role: slug }) })
}

/** `DELETE users/{id}/roles/{slug}` — 409 `conflict` when it would remove the last admin. */
export function removeRoleFromUser(userId: string, slug: string): Promise<void> {
  return request(`users/${userId}/roles/${slug}`, { method: 'DELETE' })
}

// ── Users ────────────────────────────────────────────────────────────────────

/** One keyset page of the admin user listing (`GET users?q&cursor&limit`). */
export function listUsers(params: ListUsersParams = {}): Promise<AdminUserPage> {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.cursor) search.set('cursor', params.cursor)
  if (params.limit) search.set('limit', String(params.limit))
  const query = search.toString()
  return request(`users${query ? `?${query}` : ''}`)
}

/** `PATCH users/{id}/status` — 409 `conflict` on self-disable. */
export function setUserStatus(userId: string, body: SetUserStatusBody): Promise<void> {
  return request(`users/${userId}/status`, { method: 'PATCH', body: JSON.stringify(body) })
}
