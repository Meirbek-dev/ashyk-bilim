import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '#/shared/api/errors'

import { assessmentOptions } from '../queries'

/** A 412: the assessment changed since this page read it. */
export const isStale = (error: unknown): boolean => error instanceof ApiError && error.status === 412

/**
 * Optimistic locking of the assessment's own fields (basics, rules): `If-Match` = the cached `version`; a 412 opens
 * the conflict dialog, and "reload and retry" reads the current version before the form is sent again.
 */
export function useVersion(activityId: string) {
  const queryClient = useQueryClient()
  const [conflict, setConflict] = useState(false)
  const current = () => queryClient.getQueryData(assessmentOptions(activityId).queryKey)?.version
  return {
    headers: () => ({ 'If-Match': current() }),
    conflict,
    setConflict,
    onError: (error: unknown) => setConflict(isStale(error)),
    reload: async () => {
      await queryClient.fetchQuery({ ...assessmentOptions(activityId), staleTime: 0 })
      setConflict(false)
    },
  }
}
