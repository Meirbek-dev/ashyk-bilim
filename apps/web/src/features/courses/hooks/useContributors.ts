'use client'

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addContributor,
  applyContributor,
  listContributors,
  removeContributor,
  updateContributor,
} from '@/lib/api/generated/courses/courses'
import type { AddContributorRequest, Contributor, UpdateContributorRequest } from '@/lib/api/generated/zod'
import { stripEntityPrefix } from '@/hooks/courses/courseKeys'
import { queryKeys } from '@/lib/react-query/queryKeys'

export type ContributorRole = 'creator' | 'maintainer' | 'contributor' | 'reporter'
export type ContributorStatus = 'pending' | 'active' | 'inactive'

/** Roster of `GET /courses/{id}/contributors` (creator first). */
export function contributorsQueryOptions(courseUuid: string) {
  const id = stripEntityPrefix(courseUuid)
  return queryOptions({
    queryKey: queryKeys.courses.contributors(id),
    queryFn: () => listContributors(id),
  })
}

export function useContributors(courseUuid: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    ...contributorsQueryOptions(courseUuid ?? '__disabled__'),
    enabled: (options?.enabled ?? true) && Boolean(courseUuid),
  })
}

/** Add / change / remove / apply; every mutation refetches the roster. */
export function useContributorMutations(courseUuid: string) {
  const id = stripEntityPrefix(courseUuid)
  const queryClient = useQueryClient()
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.contributors(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.metadata(id) }),
    ])
  }

  const add = useMutation({
    mutationFn: (body: AddContributorRequest) => addContributor(id, body),
    onSettled: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: UpdateContributorRequest }) =>
      updateContributor(id, userId, body),
    onSettled: invalidate,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => removeContributor(id, userId),
    onSettled: invalidate,
  })
  const apply = useMutation({
    mutationFn: () => applyContributor(id),
    onSettled: invalidate,
  })

  return {
    add: (body: AddContributorRequest) => add.mutateAsync(body),
    update: (userId: string, body: UpdateContributorRequest) => update.mutateAsync({ userId, body }),
    remove: (userId: string) => remove.mutateAsync(userId),
    apply: () => apply.mutateAsync(),
    isAdding: add.isPending,
    isApplying: apply.isPending,
    /** User ids with an in-flight change/remove, for per-row spinners. */
    busyUserId: update.isPending ? update.variables?.userId : remove.isPending ? remove.variables : undefined,
  }
}

export const contributorOf = (roster: Contributor[] | undefined, userId: string | null | undefined) =>
  userId ? roster?.find(row => row.user_id === userId) : undefined
