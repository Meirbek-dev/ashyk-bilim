'use client'

import { apiJson } from '@/lib/api-client'
import { collectPages } from '@/lib/api/contract'
import type { AdminUser, AdminUserPage, Usergroup, UsergroupMember, UsergroupPage } from '@/lib/api/generated/zod'
import { listRoleAuditLog, listRoles, listUserRoles, listUsers } from '@services/rbac'
import { queryOptions } from '@tanstack/react-query'
import { getCoursesByUser, getUserById, getUserByUsername, userKeys } from '@/lib/users/client'
import { queryKeys } from '@/lib/react-query/queryKeys'

export function userByIdQueryOptions(userId: string) {
  return queryOptions({
    queryKey: userKeys.byId(userId),
    queryFn: () => getUserById(userId),
  })
}

export function userByUsernameQueryOptions(username: string) {
  return queryOptions({
    queryKey: userKeys.byUsername(username),
    queryFn: () => getUserByUsername(username),
  })
}

export function userCoursesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: userKeys.coursesByUser(userId),
    queryFn: () => getCoursesByUser(userId),
  })
}

/** Every usergroup (keyset pages walked to the end). */
export function userGroupsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.userGroups.all(),
    queryFn: (): Promise<Usergroup[]> =>
      collectPages(cursor => apiJson<UsergroupPage>(`usergroups?limit=100${cursor ? `&cursor=${cursor}` : ''}`)),
  })
}

export function userGroupUsersQueryOptions(userGroupId: string) {
  return queryOptions({
    queryKey: queryKeys.userGroups.users(userGroupId),
    queryFn: () => apiJson<UsergroupMember[]>(`usergroups/${userGroupId}/members`),
  })
}

/** Admin user listing (`GET /users`, keyset pages walked to the end). */
export function allMembersQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.users.admin({}),
    queryFn: (): Promise<AdminUser[]> =>
      collectPages(cursor => apiJson<AdminUserPage>(`users?limit=100${cursor ? `&cursor=${cursor}` : ''}`)),
  })
}

export function rolesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.users.roles(),
    queryFn: () => listRoles(),
  })
}

export function roleAuditLogQueryOptions(page: number, pageSize = 20) {
  return queryOptions({
    queryKey: ['users', 'role-audit-log', page, pageSize] as const,
    queryFn: () => listRoleAuditLog(page, pageSize),
  })
}

export function userRoleAssignmentsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.users.roleAssignments(),
    queryFn: () => listUserRoles(),
  })
}

export function basicUsersQueryOptions(limit = 100) {
  return queryOptions({
    queryKey: queryKeys.users.basicList(limit),
    queryFn: () => listUsers(limit),
  })
}
