'use client'

import { apiJson } from '@/lib/api-client'
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

export function userGroupsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.userGroups.all(),
    queryFn: () => apiJson<{ id: number; name: string; description?: string }[]>(`usergroups`),
  })
}

export function userGroupUsersQueryOptions(userGroupId: number) {
  return queryOptions({
    queryKey: queryKeys.userGroups.users(userGroupId),
    queryFn: () => apiJson<unknown[]>(`usergroups/${userGroupId}/users`),
  })
}

export function allMembersQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.users.admin({}),
    queryFn: () => apiJson(`users?limit=100`),
  })
}

export function membersQueryOptions(page: number, perPage: number) {
  return queryOptions({
    queryKey: queryKeys.users.admin({ cursor: String(page) }),
    queryFn: () =>
      apiJson<{ items: unknown[]; next_cursor?: string | null }>(`users?limit=${perPage}`).then(data => ({
        total: data.items.length,
        total_pages: data.next_cursor ? page + 1 : page,
        users: data.items,
      })),
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
