'use client'

import { contributorOf, useContributors } from '@/features/courses/hooks/useContributors'
import { useSession } from '@/hooks/useSession'

export type ContributorStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'INACTIVE'

/**
 * The signed-in user's row on the course roster (`GET /courses/{id}/contributors`,
 * creator included as `creator/active`). `NONE` when absent or signed out.
 */
export function useContributorStatus(courseUuid: string) {
  const { session } = useSession()
  const userId = session?.userId ?? null
  const query = useContributors(courseUuid, { enabled: Boolean(userId) })
  const row = contributorOf(query.data, userId)
  const contributorStatus: ContributorStatus = row
    ? (row.status.toUpperCase() as Exclude<ContributorStatus, 'NONE'>)
    : 'NONE'
  return {
    contributorStatus,
    contributorRole: row?.role ?? null,
    isLoading: Boolean(userId) && query.isPending,
    refetch: async () => {
      await query.refetch()
    },
  }
}
