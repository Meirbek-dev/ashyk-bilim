import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import {
  createGroupMutation,
  deleteGroupMutation,
  getGroupOptions,
  getGroupQueryKey,
  listGroupMembersPageInfiniteQueryKey,
  listGroupsInfiniteQueryKey,
  updateGroupMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { addGroupMembers, listGroupMembersPage, listGroups, removeGroupMembers } from '#/shared/api/gen/sdk.gen'
import type {
  Usergroup,
  UsergroupId,
  UsergroupMember,
  UsergroupMemberPage,
  UsergroupPage,
} from '#/shared/api/gen/types.gen'

import { nextCursor, notFoundOn404, PAGE_SIZE, representation } from './queries'

export const groupsListOptions = () => {
  const query = { limit: PAGE_SIZE }
  return infiniteQueryOptions<
    UsergroupPage,
    ApiError,
    InfiniteData<UsergroupPage>,
    ReturnType<typeof listGroupsInfiniteQueryKey>,
    UsergroupId | undefined
  >({
    queryKey: listGroupsInfiniteQueryKey({ query }),
    queryFn: async ({ pageParam, signal }) => {
      const cursor = pageParam ? { cursor: pageParam } : {}
      const { data } = await listGroups({ query: { ...query, ...cursor }, signal, throwOnError: true })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: nextCursor,
  })
}

export const groupOptions = (id: UsergroupId) => getGroupOptions({ path: { group_id: id } })

const membersKey = (id: UsergroupId) =>
  listGroupMembersPageInfiniteQueryKey({ path: { group_id: id }, query: { limit: PAGE_SIZE } })

/** A group's members as keyset pages ("Show more"). */
export const membersOptions = (id: UsergroupId) =>
  infiniteQueryOptions<
    UsergroupMemberPage,
    ApiError,
    InfiniteData<UsergroupMemberPage>,
    ReturnType<typeof membersKey>,
    string | undefined
  >({
    queryKey: membersKey(id),
    queryFn: async ({ pageParam, signal }) => {
      const cursor = pageParam ? { cursor: pageParam } : {}
      const query = { limit: PAGE_SIZE, ...cursor }
      return (await listGroupMembersPage({ path: { group_id: id }, query, signal, throwOnError: true })).data
    },
    initialPageParam: undefined,
    getNextPageParam: nextCursor,
  })

/** Route loader of a group page: an unknown or malformed id is "not found". */
export const ensureGroup = (queryClient: QueryClient, id: UsergroupId) =>
  Promise.all([
    queryClient.ensureQueryData(groupOptions(id)),
    queryClient.ensureInfiniteQueryData(membersOptions(id)),
  ]).catch(notFoundOn404)

// The infinite group lists only: the panel's group choices stay as loaded (a refetch there repeats its GET).
const groupLists = () => listGroupsInfiniteQueryKey()

export const createGroupOptions = () => ({ ...createGroupMutation(), meta: { invalidates: [groupLists()] } })

export const updateGroupOptions = (queryClient: QueryClient, id: UsergroupId) => ({
  ...updateGroupMutation(),
  onSuccess: (group: Usergroup) => queryClient.setQueryData(getGroupQueryKey({ path: { group_id: id } }), group),
  meta: { invalidates: [groupLists()] },
})

export const deleteGroupOptions = () => ({ ...deleteGroupMutation(), meta: { invalidates: [groupLists()] } })

type Membership = { group: UsergroupId; members: UsergroupMember[] }
const ids = (members: UsergroupMember[]) => ({ user_ids: members.map(member => member.id) })

/**
 * Both answer the group (`Prefer: return=representation`): it replaces the cached group and its list rows (member
 * count); the loaded member pages take the change themselves (a refetch would repeat their GETs).
 */
function putMembership(
  queryClient: QueryClient,
  id: UsergroupId,
  next: Usergroup | void,
  change: (pages: UsergroupMemberPage[]) => UsergroupMemberPage[],
) {
  queryClient.setQueryData<InfiniteData<UsergroupMemberPage>>(
    membersKey(id),
    data => data && { ...data, pages: change(data.pages) },
  )
  if (!next) return
  const page = (one: UsergroupPage) => ({ ...one, items: one.items.map(row => (row.id === next.id ? next : row)) })
  queryClient.setQueryData(getGroupQueryKey({ path: { group_id: id } }), next)
  queryClient.setQueriesData<InfiniteData<UsergroupPage>>(
    { queryKey: groupLists() },
    data => data && { ...data, pages: data.pages.map(page) },
  )
}

const membership = ({ group, members }: Membership) => ({
  path: { group_id: group },
  body: ids(members),
  throwOnError: true,
  ...representation,
})

// Added members join the last loaded page; a later page that lists them again is deduplicated by `memberList`.
const appendTo = (members: UsergroupMember[]) => (pages: UsergroupMemberPage[]) =>
  pages.map((page, index) => (index < pages.length - 1 ? page : { ...page, items: [...page.items, ...members] }))

export const addMembersOptions = (queryClient: QueryClient) => ({
  mutationFn: async (change: Membership) => (await addGroupMembers(membership(change))).data,
  onSuccess: (next: Usergroup | void, { group, members }: Membership) =>
    putMembership(queryClient, group, next, appendTo(members)),
})

export const removeMembersOptions = (queryClient: QueryClient) => ({
  mutationFn: async (change: Membership) => (await removeGroupMembers(membership(change))).data,
  onSuccess: (next: Usergroup | void, { group, members }: Membership) =>
    putMembership(queryClient, group, next, pages =>
      pages.map(page => ({
        ...page,
        items: page.items.filter(member => !members.some(gone => gone.id === member.id)),
      })),
    ),
})

/** The loaded pages as one list, each member once (an added member may come again on a later page). */
export const memberList = (pages: UsergroupMemberPage[]) => [
  ...new Map(pages.flatMap(page => page.items).map(member => [member.id, member])).values(),
]
