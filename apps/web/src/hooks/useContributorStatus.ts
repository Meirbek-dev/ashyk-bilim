'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { contributorOf, useContributors } from '@/features/courses/hooks/useContributors'
import { learnerCourseStateQueryOptions } from '@/features/learner-course/api'
import { stripEntityPrefix } from '@/hooks/courses/courseKeys'
import { useSession } from '@/hooks/useSession'

export type ContributorStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'INACTIVE'

/**
 * The signed-in user's row on the course roster (`GET /courses/{id}/contributors`,
 * creator included as `creator/active`). `NONE` when absent or signed out.
 */
export function useContributorStatus(courseUuid: string) {
  const { session } = useSession()
  const queryClient = useQueryClient()
  const userId = session?.userId ?? null
  const query = useContributors(courseUuid, {
    enabled: Boolean(userId),
    // UX-233: no learner event channel — while the application is pending,
    // poll the visible tab so an approval shows without a reload (focus
    // refetch covers the tab-switch case).
    refetchInterval: roster => (contributorOf(roster, userId)?.status === 'pending' ? 10_000 : false),
  })
  const row = contributorOf(query.data, userId)
  const contributorStatus: ContributorStatus = row
    ? (row.status.toUpperCase() as Exclude<ContributorStatus, 'NONE'>)
    : 'NONE'

  // UX-251: a roster change (approval seen by the poll) also changes what the
  // landing offers — staff never enrol — so the learner-state behind the CTA
  // must refetch, not only the roster.
  const lastStatus = useRef<ContributorStatus | null>(null)
  useEffect(() => {
    if (query.isPending) return
    const previous = lastStatus.current
    lastStatus.current = contributorStatus
    if (previous !== null && previous !== contributorStatus) {
      void queryClient.invalidateQueries({
        queryKey: learnerCourseStateQueryOptions(stripEntityPrefix(courseUuid)).queryKey,
      })
    }
  }, [contributorStatus, courseUuid, query.isPending, queryClient])

  return {
    contributorStatus,
    contributorRole: row?.role ?? null,
    isLoading: Boolean(userId) && query.isPending,
    refetch: async () => {
      await query.refetch()
    },
  }
}
