'use client'

import { queryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  adminUsersInfiniteQueryOptions,
  allMembersQueryOptions,
  rolesQueryOptions,
  userByIdQueryOptions,
  userByUsernameQueryOptions,
  userCoursesQueryOptions,
  userGroupUsersQueryOptions,
  userGroupsQueryOptions,
} from '../queries/users.query'

function userGroupsHookOptions(enabled = true) {
  return queryOptions({
    ...userGroupsQueryOptions(),
    enabled,
  })
}

function userGroupUsersHookOptions(userGroupId: string | null | undefined) {
  return queryOptions({
    ...userGroupUsersQueryOptions(userGroupId ?? ''),
    enabled: Boolean(userGroupId),
  })
}

function userByIdHookOptions(userId: string | null | undefined, enabled = true) {
  const normalizedUserId = userId ?? '__disabled__'

  return queryOptions({
    ...userByIdQueryOptions(normalizedUserId),
    enabled: enabled && userId !== null && userId !== undefined,
  })
}

function userByUsernameHookOptions(username: string | null | undefined, enabled = true) {
  const normalizedUsername = username?.trim() ?? ''

  return queryOptions({
    ...userByUsernameQueryOptions(normalizedUsername || '__disabled__'),
    enabled: enabled && normalizedUsername.length > 0,
  })
}

function userCoursesHookOptions(username: string | null | undefined, enabled = true) {
  const normalized = username?.trim() ?? ''

  return queryOptions({
    ...userCoursesQueryOptions(normalized || '__disabled__'),
    enabled: enabled && normalized.length > 0,
  })
}

export function useUserGroups(options?: { enabled?: boolean }) {
  return useQuery(userGroupsHookOptions(options?.enabled ?? true))
}

export function useUserGroupUsers(userGroupId: string | null | undefined) {
  return useQuery(userGroupUsersHookOptions(userGroupId))
}

export function useAllMembers(options?: { enabled?: boolean }) {
  return useQuery(queryOptions({ ...allMembersQueryOptions(), enabled: options?.enabled ?? true }))
}

export function useAdminUsers(q: string) {
  return useInfiniteQuery(adminUsersInfiniteQueryOptions(q))
}

export function useRoles() {
  return useQuery(rolesQueryOptions())
}

export function useUserCourses(username: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery(userCoursesHookOptions(username, options?.enabled ?? true))
}

export function useUserByIdQuery(userId: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery(userByIdHookOptions(userId, options?.enabled ?? true))
}

export function useUserByUsernameQuery(username: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery(userByUsernameHookOptions(username, options?.enabled ?? true))
}
