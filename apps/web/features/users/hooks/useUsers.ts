'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  allMembersQueryOptions,
  basicUsersQueryOptions,
  membersQueryOptions,
  roleAuditLogQueryOptions,
  rolesQueryOptions,
  userCoursesQueryOptions,
  userByIdQueryOptions,
  userByUsernameQueryOptions,
  userGroupUsersQueryOptions,
  userGroupsQueryOptions,
  userRoleAssignmentsQueryOptions,
} from '../queries/users.query';

function userGroupsHookOptions(enabled = true) {
  return queryOptions({
    ...userGroupsQueryOptions(),
    enabled,
  });
}

function userGroupUsersHookOptions(userGroupId: number | null | undefined) {
  const normalizedUserGroupId = userGroupId ?? 0;

  return queryOptions({
    ...userGroupUsersQueryOptions(normalizedUserGroupId),
    enabled: Boolean(userGroupId),
  });
}

function userByIdHookOptions(userId: number | null | undefined, enabled = true) {
  const normalizedUserId = userId ?? 0;

  return queryOptions({
    ...userByIdQueryOptions(normalizedUserId),
    enabled: enabled && userId !== null && userId !== undefined,
  });
}

function userByUsernameHookOptions(username: string | null | undefined, enabled = true) {
  const normalizedUsername = username?.trim() ?? '';

  return queryOptions({
    ...userByUsernameQueryOptions(normalizedUsername || '__disabled__'),
    enabled: enabled && normalizedUsername.length > 0,
  });
}

function userCoursesHookOptions(userId: number | null | undefined, enabled = true) {
  const normalizedUserId = userId ?? 0;

  return queryOptions({
    ...userCoursesQueryOptions(normalizedUserId),
    enabled: enabled && userId !== null && userId !== undefined,
  });
}

function userRoleAssignmentsHookOptions(enabled = true) {
  return queryOptions({
    ...userRoleAssignmentsQueryOptions(),
    enabled,
  });
}

function basicUsersHookOptions(limit = 100, enabled = true) {
  return queryOptions({
    ...basicUsersQueryOptions(limit),
    enabled,
  });
}

function roleAuditLogHookOptions(page: number, pageSize = 20, enabled = true) {
  return queryOptions({
    ...roleAuditLogQueryOptions(page, pageSize),
    enabled,
  });
}

export function useUserGroups(options?: { enabled?: boolean }) {
  return useQuery(userGroupsHookOptions(options?.enabled ?? true));
}

export function useUserGroupUsers(userGroupId: number | null | undefined) {
  return useQuery(userGroupUsersHookOptions(userGroupId));
}

export function useAllMembers() {
  return useQuery(allMembersQueryOptions());
}

export function useMembers(page: number, perPage: number) {
  return useQuery(membersQueryOptions(page, perPage));
}

export function useRoles() {
  return useQuery(rolesQueryOptions());
}

export function useRoleAuditLog(page: number, pageSize = 20, options?: { enabled?: boolean }) {
  return useQuery(roleAuditLogHookOptions(page, pageSize, options?.enabled ?? true));
}

export function useUserRoleAssignments(options?: { enabled?: boolean }) {
  return useQuery(userRoleAssignmentsHookOptions(options?.enabled ?? true));
}

export function useBasicUsers(limit = 100, options?: { enabled?: boolean }) {
  return useQuery(basicUsersHookOptions(limit, options?.enabled ?? true));
}

export function useUserCourses(userId: number | null | undefined, options?: { enabled?: boolean }) {
  return useQuery(userCoursesHookOptions(userId, options?.enabled ?? true));
}

export function useUserByIdQuery(userId: number | null | undefined, options?: { enabled?: boolean }) {
  return useQuery(userByIdHookOptions(userId, options?.enabled ?? true));
}

export function useUserByUsernameQuery(username: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery(userByUsernameHookOptions(username, options?.enabled ?? true));
}
