'use client';

import { apiFetcher } from '@/lib/api-client';
import { getAPIUrl } from '@services/config/config';
import { listRoleAuditLog, listRoles, listUserRoles, listUsers } from '@services/rbac';
import { queryOptions } from '@tanstack/react-query';
import { getCoursesByUser, getUserById, getUserByUsername, userKeys } from '@/lib/users/client';
import { queryKeys } from '@/lib/react-query/queryKeys';

export function userByIdQueryOptions(userId: number) {
  return queryOptions({
    queryKey: userKeys.byId(userId),
    queryFn: () => getUserById(userId),
  });
}

export function userByUsernameQueryOptions(username: string) {
  return queryOptions({
    queryKey: userKeys.byUsername(username),
    queryFn: () => getUserByUsername(username),
  });
}

export function userCoursesQueryOptions(userId: number) {
  return queryOptions({
    queryKey: userKeys.coursesByUser(userId),
    queryFn: async () => (await getCoursesByUser(userId)).data ?? [],
  });
}

export function userGroupsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.userGroups.all(),
    queryFn: () => apiFetcher(`${getAPIUrl()}usergroups`),
  });
}

export function userGroupUsersQueryOptions(userGroupId: number) {
  return queryOptions({
    queryKey: queryKeys.userGroups.users(userGroupId),
    queryFn: () => apiFetcher(`${getAPIUrl()}usergroups/${userGroupId}/users`),
  });
}

export function allMembersQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.users.allMembers(),
    queryFn: () => apiFetcher(`${getAPIUrl()}members`),
  });
}

export function membersQueryOptions(page: number, perPage: number) {
  return queryOptions({
    queryKey: queryKeys.users.members(page, perPage),
    queryFn: () => apiFetcher(`${getAPIUrl()}members?page=${page}&per_page=${perPage}`),
  });
}

export function rolesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.users.roles(),
    queryFn: () => listRoles(),
  });
}

export function roleAuditLogQueryOptions(page: number, pageSize = 20) {
  return queryOptions({
    queryKey: queryKeys.users.roleAuditLog(page, pageSize),
    queryFn: () => listRoleAuditLog(page, pageSize),
  });
}

export function userRoleAssignmentsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.users.roleAssignments(),
    queryFn: () => listUserRoles(),
  });
}

export function basicUsersQueryOptions(limit = 100) {
  return queryOptions({
    queryKey: queryKeys.users.basicList(limit),
    queryFn: () => listUsers(limit),
  });
}
