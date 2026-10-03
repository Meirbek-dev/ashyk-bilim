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
import { addUsergroupMembers, listUsergroups, listUsers, removeUsergroupMembers } from '#/shared/api/gen/sdk.gen'
import type {
  AdminUser,
  AdminUserPage,
  GamificationConfig,
  Platform,
  Role,
  SearchResults,
  SessionInfo,
  UserId,
  Usergroup,
  UsergroupId,
  UsergroupMember,
  UsergroupPage,
} from '#/shared/api/gen/types.gen'
import { hasCapability } from '#/shared/auth/access'

import type { UsersSearch } from './route'

const PAGE_SIZE = 20

/** Keyset paging: the next request carries the previous page's opaque `next_cursor`. */
const nextCursor = (page: { next_cursor: string | null }) => page.next_cursor ?? undefined

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

/** `Prefer: return=representation`: these writes answer the changed object instead of 204. */
const representation = { headers: { Prefer: 'return=representation' } }

/** The answered user replaces every cached copy (list pages and the panel), `allowed_actions` included. */
function putUser(queryClient: QueryClient, next: AdminUser | void) {
  if (!next) return
  const page = (one: AdminUserPage) => ({ ...one, items: one.items.map(user => (user.id === next.id ? next : user)) })
  queryClient.setQueriesData<UsersData>({ queryKey: listUsersQueryKey() }, data =>
    !data || !('pages' in data) ? data && page(data) : { ...data, pages: data.pages.map(page) },
  )
}

// Every list variant (any search, any cursor) and the panel's lookup are prefix matches of the bare key.
export const createUserOptions = () => ({ ...createUserMutation(), meta: { invalidates: [listUsersQueryKey()] } })

export const assignRoleOptions = (queryClient: QueryClient) => ({
  ...assignRoleMutation(representation),
  onSuccess: (user: AdminUser | void) => putUser(queryClient, user),
})

export const unassignRoleOptions = (queryClient: QueryClient) => ({
  ...unassignRoleMutation(representation),
  onSuccess: (user: AdminUser | void) => putUser(queryClient, user),
})

export const setUserStatusOptions = (queryClient: QueryClient) => ({
  ...setUserStatusMutation(representation),
  onSuccess: (user: AdminUser | void) => putUser(queryClient, user),
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

/** The answered role replaces its row of the cached list. */
const putRole = (queryClient: QueryClient) => (next: Role | void) => {
  if (next)
    queryClient.setQueryData(listRolesQueryKey(), (roles: Role[] | undefined) =>
      roles?.map(role => (role.slug === next.slug ? next : role)),
    )
}

export const createRoleOptions = () => ({ ...createRoleMutation(), meta: { invalidates: [listRolesQueryKey()] } })

export const updateRoleOptions = (queryClient: QueryClient) => ({
  ...updateRoleMutation(representation),
  onSuccess: putRole(queryClient),
})

export const setPermissionsOptions = (queryClient: QueryClient) => ({
  ...setRolePermissionsMutation(representation),
  onSuccess: putRole(queryClient),
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

export const groupOptions = (id: UsergroupId) => getUsergroupOptions({ path: { usergroup_id: id } })
export const membersOptions = (id: UsergroupId) => listUsergroupMembersOptions({ path: { usergroup_id: id } })

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
  onSuccess: (group: Usergroup) =>
    queryClient.setQueryData(getUsergroupQueryKey({ path: { usergroup_id: id } }), group),
  meta: { invalidates: [groupLists()] },
})

export const deleteGroupOptions = () => ({ ...deleteUsergroupMutation(), meta: { invalidates: [groupLists()] } })

type Membership = { group: UsergroupId; members: UsergroupMember[] }
const ids = (members: UsergroupMember[]) => ({ user_ids: members.map(member => member.id) })

/**
 * Both answer the group (`Prefer: return=representation`): it replaces the cached group and its list rows (member
 * count); the members list (when cached) takes the change itself.
 */
function putMembership(
  queryClient: QueryClient,
  id: UsergroupId,
  next: Usergroup | void,
  change: (list: UsergroupMember[]) => UsergroupMember[],
) {
  queryClient.setQueryData(
    listUsergroupMembersQueryKey({ path: { usergroup_id: id } }),
    (list: UsergroupMember[] | undefined) => list && change(list),
  )
  if (!next) return
  const page = (one: UsergroupPage) => ({ ...one, items: one.items.map(row => (row.id === next.id ? next : row)) })
  queryClient.setQueryData(getUsergroupQueryKey({ path: { usergroup_id: id } }), next)
  queryClient.setQueriesData<InfiniteData<UsergroupPage>>(
    { queryKey: groupLists() },
    data => data && { ...data, pages: data.pages.map(page) },
  )
}

const membership = ({ group, members }: Membership) => ({
  path: { usergroup_id: group },
  body: ids(members),
  throwOnError: true,
  ...representation,
})

export const addMembersOptions = (queryClient: QueryClient) => ({
  mutationFn: async (change: Membership) => (await addUsergroupMembers(membership(change))).data,
  onSuccess: (next: Usergroup | void, { group, members }: Membership) =>
    putMembership(queryClient, group, next, list => [
      ...list,
      ...members.filter(added => !list.some(m => m.id === added.id)),
    ]),
})

export const removeMembersOptions = (queryClient: QueryClient) => ({
  mutationFn: async (change: Membership) => (await removeUsergroupMembers(membership(change))).data,
  onSuccess: (next: Usergroup | void, { group, members }: Membership) =>
    putMembership(queryClient, group, next, list =>
      list.filter(member => !members.some(gone => gone.id === member.id)),
    ),
})
