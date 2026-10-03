import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  adminAwardMutation,
  assignRoleMutation,
  createRoleMutation,
  createUserMutation,
  createUsergroupMutation,
  deleteRoleMutation,
  deleteUsergroupMutation,
  getConfigOptions,
  getConfigQueryKey,
  getPlatformOptions,
  getPlatformQueryKey,
  getUsergroupOptions,
  getUsergroupQueryKey,
  listRolesOptions,
  listRolesQueryKey,
  listUsergroupMembersOptions,
  listUsergroupMembersQueryKey,
  listUsergroupsInfiniteQueryKey,
  listUsergroupsOptions,
  listUsersInfiniteQueryKey,
  listUsersOptions,
  listUsersQueryKey,
  searchOptions,
  setRolePermissionsMutation,
  setUserStatusMutation,
  unassignRoleMutation,
  updateConfigMutation,
  updatePlatformMutation,
  updateRoleMutation,
  updateUsergroupMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import {
  addUsergroupMembers,
  listUsergroups,
  listUsers,
  type Options,
  removeUsergroupMembers,
} from '#/shared/api/gen/sdk.gen'
import type {
  AdminUser,
  AdminUserPage,
  AssignRoleData,
  GamificationConfig,
  Platform,
  Role,
  SearchResults,
  SessionInfo,
  SetRolePermissionsData,
  SetUserStatusData,
  UnassignRoleData,
  UpdateRoleData,
  UserId,
  Usergroup,
  UsergroupId,
  UsergroupMember,
  UsergroupPage,
} from '#/shared/api/gen/types.gen'
import { hasCapability } from '#/shared/auth/access'

import type { UsersSearch } from './model/admin'

const PAGE_SIZE = 20

/** Keyset paging: the next request carries the previous page's opaque `next_cursor`. */
const nextCursor = (page: { next_cursor?: string | null }) => page.next_cursor ?? undefined

// Composed by hand: the generated infinite options type the queryFn as skippable, which useSuspenseInfiniteQuery
// rejects. Key and request still come from the generated client.
export const usersListOptions = (q: string | undefined) => {
  const query = { limit: PAGE_SIZE, ...(q ? { q } : {}) }
  return infiniteQueryOptions<
    AdminUserPage,
    ApiError,
    InfiniteData<AdminUserPage>,
    ReturnType<typeof listUsersInfiniteQueryKey>,
    UserId | undefined
  >({
    queryKey: listUsersInfiniteQueryKey({ query }),
    queryFn: async ({ pageParam, signal }) => {
      const cursor = pageParam ? { cursor: pageParam } : {}
      const { data } = await listUsers({ query: { ...query, ...cursor }, signal, throwOnError: true })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: nextCursor,
  })
}

/** No admin read of one user exists (SPEC): the directory search by username, kept to the exact match. */
export const userOptions = (username: string) => ({
  ...listUsersOptions({ query: { q: username, limit: 100 } }),
  select: (page: AdminUserPage) => page.items.find(user => user.username === username) ?? null,
})

/**
 * Route loader of /admin/users: the list, the user open in the panel, and what the panel offers by capability (role
 * names need `admin.roles`, the group choice `groups.manage`).
 */
export function loadUsersPage(queryClient: QueryClient, session: SessionInfo | null, search: UsersSearch) {
  const { q, user } = search
  return Promise.all([
    queryClient.ensureInfiniteQueryData(usersListOptions(q)),
    user ? queryClient.ensureQueryData(userOptions(user)) : null,
    hasCapability(session, 'admin.roles') ? queryClient.ensureQueryData(rolesOptions()) : null,
    user && hasCapability(session, 'groups.manage') ? queryClient.ensureQueryData(groupChoicesOptions()) : null,
  ])
}

type UsersData = InfiniteData<AdminUserPage> | AdminUserPage

/** These writes answer 204: the change goes into every cached copy of the user (list pages and the panel). */
function patchUser(queryClient: QueryClient, id: UserId, change: (user: AdminUser) => AdminUser) {
  const page = (one: AdminUserPage) => ({
    ...one,
    items: one.items.map(user => (user.id === id ? change(user) : user)),
  })
  queryClient.setQueriesData<UsersData>({ queryKey: listUsersQueryKey() }, data =>
    !data || !('pages' in data) ? data && page(data) : { ...data, pages: data.pages.map(page) },
  )
}

// Every list variant (any search, any cursor) and the panel's lookup are prefix matches of the bare key.
export const createUserOptions = () => ({ ...createUserMutation(), meta: { invalidates: [listUsersQueryKey()] } })

export const assignRoleOptions = (queryClient: QueryClient) => ({
  ...assignRoleMutation(),
  onSuccess: (_: unknown, { path, body }: Options<AssignRoleData>) =>
    patchUser(queryClient, path.user_id, user => ({ ...user, roles: [...user.roles, body.role] })),
})

export const unassignRoleOptions = (queryClient: QueryClient) => ({
  ...unassignRoleMutation(),
  onSuccess: (_: unknown, { path }: Options<UnassignRoleData>) =>
    patchUser(queryClient, path.user_id, user => ({ ...user, roles: user.roles.filter(slug => slug !== path.slug) })),
})

export const setUserStatusOptions = (queryClient: QueryClient) => ({
  ...setUserStatusMutation(),
  onSuccess: (_: unknown, { path, body }: Options<SetUserStatusData>) =>
    patchUser(queryClient, path.user_id, user => ({ ...user, status: body.disabled ? 'disabled' : 'active' })),
})

export const awardOptions = () => adminAwardMutation()

export const rolesOptions = () => listRolesOptions()

/** Route loader of a role page: there is no read of one role, so an unknown slug in the list is "not found". */
export async function ensureRole(queryClient: QueryClient, slug: string) {
  const roles = await queryClient.ensureQueryData(rolesOptions())
  const role = roles.find(entry => entry.slug === slug)
  if (!role) throw notFound()
  return role
}

const patchRole = (queryClient: QueryClient, slug: string, change: (role: Role) => Role) =>
  queryClient.setQueryData(listRolesQueryKey(), (roles: Role[] | undefined) =>
    roles?.map(role => (role.slug === slug ? change(role) : role)),
  )

export const createRoleOptions = () => ({ ...createRoleMutation(), meta: { invalidates: [listRolesQueryKey()] } })

export const updateRoleOptions = (queryClient: QueryClient) => ({
  ...updateRoleMutation(),
  onSuccess: (_: unknown, { path, body }: Options<UpdateRoleData>) =>
    patchRole(queryClient, path.slug, role => ({
      ...role,
      display_name: body.display_name ?? role.display_name,
      description: body.description ?? role.description,
      priority: body.priority ?? role.priority,
    })),
})

export const setPermissionsOptions = (queryClient: QueryClient) => ({
  ...setRolePermissionsMutation(),
  onSuccess: (_: unknown, { path, body }: Options<SetRolePermissionsData>) =>
    patchRole(queryClient, path.slug, role => ({ ...role, permissions: body.permissions })),
})

// The deleted role leaves the cached list: the list page it returns to needs no refetch.
export const deleteRoleOptions = (queryClient: QueryClient) => ({
  ...deleteRoleMutation(),
  onSuccess: (_: unknown, { path }: { path: { slug: string } }) =>
    queryClient.setQueryData(listRolesQueryKey(), (roles: Role[] | undefined) =>
      roles?.filter(role => role.slug !== path.slug),
    ),
})

export const platformOptions = () => getPlatformOptions()

export const updatePlatformOptions = (queryClient: QueryClient) => ({
  ...updatePlatformMutation(),
  onSuccess: (platform: Platform) => queryClient.setQueryData(getPlatformQueryKey(), platform),
})

export const configOptions = () => getConfigOptions()

export const updateConfigOptions = (queryClient: QueryClient) => ({
  ...updateConfigMutation(),
  onSuccess: (config: GamificationConfig) => queryClient.setQueryData(getConfigQueryKey(), config),
})

/** People by name or username: the platform search's people section, open to every signed-in caller. */
export const peopleOptions = (q: string) => ({
  ...searchOptions({ query: { q, limit: PAGE_SIZE } }),
  select: (results: SearchResults) => results.users,
})

/** A 404 or a malformed id (422) of an object page is "not found". */
const notFoundOn404 = (error: unknown): never => {
  if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
  throw error
}

export const groupsListOptions = () => {
  const query = { limit: PAGE_SIZE }
  return infiniteQueryOptions<
    UsergroupPage,
    ApiError,
    InfiniteData<UsergroupPage>,
    ReturnType<typeof listUsergroupsInfiniteQueryKey>,
    UsergroupId | undefined
  >({
    queryKey: listUsergroupsInfiniteQueryKey({ query }),
    queryFn: async ({ pageParam, signal }) => {
      const cursor = pageParam ? { cursor: pageParam } : {}
      const { data } = await listUsergroups({ query: { ...query, ...cursor }, signal, throwOnError: true })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: nextCursor,
  })
}

// ponytail: the first 100 groups only (the API's page cap); a group picker with search when platforms outgrow it.
/** The groups the user panel can add someone to: those the caller may change the members of. */
export const groupChoicesOptions = () => ({
  ...listUsergroupsOptions({ query: { limit: 100 } }),
  select: (page: UsergroupPage) => page.items.filter(group => group.allowed_actions.includes('manage_members')),
})

export const groupOptions = (id: UsergroupId) => getUsergroupOptions({ path: { id } })
export const membersOptions = (id: UsergroupId) => listUsergroupMembersOptions({ path: { id } })

/** Route loader of a group page: an unknown or malformed id is "not found". */
export const ensureGroup = (queryClient: QueryClient, id: UsergroupId) =>
  Promise.all([queryClient.ensureQueryData(groupOptions(id)), queryClient.ensureQueryData(membersOptions(id))]).catch(
    notFoundOn404,
  )

// The infinite group lists only: the panel's group choices stay as loaded (a refetch there repeats its GET).
const groupLists = () => listUsergroupsInfiniteQueryKey()

export const createGroupOptions = () => ({ ...createUsergroupMutation(), meta: { invalidates: [groupLists()] } })

export const updateGroupOptions = (queryClient: QueryClient, id: UsergroupId) => ({
  ...updateUsergroupMutation(),
  onSuccess: (group: Usergroup) => queryClient.setQueryData(getUsergroupQueryKey({ path: { id } }), group),
  meta: { invalidates: [groupLists()] },
})

export const deleteGroupOptions = () => ({ ...deleteUsergroupMutation(), meta: { invalidates: [groupLists()] } })

type Membership = { group: UsergroupId; members: UsergroupMember[] }
const ids = (members: UsergroupMember[]) => ({ user_ids: members.map(member => member.id) })

/** Both answer 204: the members list (when cached) takes the change; the lists re-read their counts when shown. */
const patchMembers = (
  queryClient: QueryClient,
  id: UsergroupId,
  change: (list: UsergroupMember[]) => UsergroupMember[],
) =>
  queryClient.setQueryData(
    listUsergroupMembersQueryKey({ path: { id } }),
    (list: UsergroupMember[] | undefined) => list && change(list),
  )

export const addMembersOptions = (queryClient: QueryClient) => ({
  mutationFn: ({ group, members }: Membership) =>
    addUsergroupMembers({ path: { id: group }, body: ids(members), throwOnError: true }),
  onSuccess: (_: unknown, { group, members }: Membership) =>
    patchMembers(queryClient, group, list => [...list, ...members.filter(added => !list.some(m => m.id === added.id))]),
  meta: { invalidates: [groupLists()] },
})

export const removeMembersOptions = (queryClient: QueryClient) => ({
  mutationFn: ({ group, members }: Membership) =>
    removeUsergroupMembers({ path: { id: group }, body: ids(members), throwOnError: true }),
  onSuccess: (_: unknown, { group, members }: Membership) =>
    patchMembers(queryClient, group, list => list.filter(member => !members.some(gone => gone.id === member.id))),
  meta: { invalidates: [groupLists()] },
})
