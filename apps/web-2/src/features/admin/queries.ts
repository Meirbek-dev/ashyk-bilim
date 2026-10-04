import { infiniteQueryOptions, queryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  adminAwardMutation,
  assignRoleMutation,
  createRoleMutation,
  createUserMutation,
  deleteRoleMutation,
  getAdminUserQueryKey,
  getConfigOptions,
  getConfigQueryKey,
  getPlatformOptions,
  getPlatformQueryKey,
  getRoleOptions,
  getRoleQueryKey,
  listRolesOptions,
  listRolesQueryKey,
  listGroupsOptions,
  listUsersInfiniteQueryKey,
  listUsersQueryKey,
  searchOptions,
  setRolePermissionsMutation,
  setUserStatusMutation,
  unassignRoleMutation,
  updateConfigMutation,
  updatePlatformMutation,
  updateRoleMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { getAdminUser, listUsers } from '#/shared/api/gen/sdk.gen'
import type {
  AdminUser,
  AdminUserPage,
  GamificationConfig,
  Platform,
  Role,
  SearchResults,
  SessionInfo,
  UserId,
  UsergroupPage,
} from '#/shared/api/gen/types.gen'
import { hasCapability } from '#/shared/auth/access'

import type { UsersSearch } from './route'

export const PAGE_SIZE = 20

/** Keyset paging: the next request carries the previous page's opaque `next_cursor`. */
export const nextCursor = (page: { next_cursor: string | null }) => page.next_cursor ?? undefined

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

/** The user of the panel by id; an unknown or malformed id (404, 422) is `null`: the panel says "not found". */
export const userOptions = (id: UserId) =>
  queryOptions<AdminUser | null, ApiError, AdminUser | null, ReturnType<typeof getAdminUserQueryKey>>({
    queryKey: getAdminUserQueryKey({ path: { user_id: id } }),
    queryFn: async ({ signal }) => {
      try {
        return (await getAdminUser({ path: { user_id: id }, signal, throwOnError: true })).data
      } catch (error) {
        if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null
        throw error
      }
    },
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
export const representation = { headers: { Prefer: 'return=representation' } }

/** The answered user replaces every cached copy (list pages and the panel), `allowed_actions` included. */
function putUser(queryClient: QueryClient, next: AdminUser | void) {
  if (!next) return
  queryClient.setQueryData(getAdminUserQueryKey({ path: { user_id: next.id } }), next)
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

export const roleOptions = (slug: string) => getRoleOptions({ path: { slug } })

/** Route loader of a role page: an unknown slug is "not found". */
export const ensureRole = (queryClient: QueryClient, slug: string) =>
  queryClient.ensureQueryData(roleOptions(slug)).catch(notFoundOn404)

/** The answered role replaces the role page's copy and its row of the cached list. */
const putRole = (queryClient: QueryClient) => (next: Role | void) => {
  if (!next) return
  queryClient.setQueryData(getRoleQueryKey({ path: { slug: next.slug } }), next)
  queryClient.setQueryData(listRolesQueryKey(), (roles: Role[] | undefined) =>
    roles?.map(role => (role.slug === next.slug ? next : role)),
  )
}

export const createRoleOptions = () => ({ ...createRoleMutation(), meta: { invalidates: [listRolesQueryKey()] } })

/** A role write's headers: `If-Match` (stale -> 412) and `Prefer`, so it answers the role with its new `version`. */
export const roleWrite = (version: number) => ({ headers: { ...representation.headers, 'If-Match': version } })

/** A role's current `version`, read past the cache: "Reload and retry" after a 412. */
export const roleVersion = async (queryClient: QueryClient, slug: string) =>
  (await queryClient.fetchQuery({ ...roleOptions(slug), staleTime: 0 })).version

export const updateRoleOptions = (queryClient: QueryClient) => ({
  ...updateRoleMutation(),
  onSuccess: putRole(queryClient),
})

export const setPermissionsOptions = (queryClient: QueryClient) => ({
  ...setRolePermissionsMutation(),
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

/** The platform's current `version`, read past the cache: "Reload and retry" after a 412. */
export const platformVersion = async (queryClient: QueryClient) =>
  (await queryClient.fetchQuery({ ...platformOptions(), staleTime: 0 })).version

export const updatePlatformOptions = (queryClient: QueryClient) => ({
  ...updatePlatformMutation(),
  onSuccess: (platform: Platform) => queryClient.setQueryData(getPlatformQueryKey(), platform),
})

export const configOptions = () => getConfigOptions()

export const configVersion = async (queryClient: QueryClient) =>
  (await queryClient.fetchQuery({ ...configOptions(), staleTime: 0 })).version ?? 0

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
export const notFoundOn404 = (error: unknown): never => {
  if (error instanceof ApiError && (error.status === 404 || error.status === 422)) throw notFound()
  throw error
}

// ponytail: the first 100 groups only (the API's page cap); a group picker with search when platforms outgrow it.
/** The groups the user panel can add someone to: those the caller may change the members of. */
export const groupChoicesOptions = () => ({
  ...listGroupsOptions({ query: { limit: 100 } }),
  select: (page: UsergroupPage) => page.items.filter(group => group.allowed_actions.includes('manage_members')),
})
