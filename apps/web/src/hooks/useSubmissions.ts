'use client'

import type { StatusFilter } from '@/features/grading/review/types'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { submissionsQueryOptions } from '@/features/grading/queries/grading.query'
import { useState } from 'react'

export interface UseSubmissionsOptions {
  activityId: number | null
  assessmentUuid?: string | null
  status?: StatusFilter | null
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  pageSize?: number
}

function submissionsHookOptions(
  activityId: number | null,
  assessmentUuid: string | null | undefined,
  page: number,
  pageSize: number,
  search: string,
  sortBy: string,
  sortDir: 'asc' | 'desc',
  status: StatusFilter,
) {
  const queryStatus = status === 'AWAITING_RELEASE' ? 'GRADED' : status

  return queryOptions({
    ...submissionsQueryOptions({
      assessmentUuid: assessmentUuid ?? '',
      page,
      pageSize,
      search,
      sortBy,
      sortDir,
      status: queryStatus,
    }),
    // v2 keys submissions by assessment id; `activityId` is a legacy numeric
    // prop the v2 review passes as 0 and must not gate the query.
    enabled: Boolean(assessmentUuid),
  })
}

export function useSubmissions({
  activityId,
  assessmentUuid,
  status,
  search,
  sortBy = 'submitted_at',
  sortDir = 'desc',
  pageSize = 25,
}: UseSubmissionsOptions) {
  const [page, setPage] = useState(1)
  const [prevActivityId, setPrevActivityId] = useState(activityId)

  if (activityId !== prevActivityId) {
    setPrevActivityId(activityId)
    setPage(1)
  }

  const queryStatus = status === 'AWAITING_RELEASE' ? 'GRADED' : (status ?? 'ALL')
  const queryParams = {
    assessmentUuid: assessmentUuid ?? '',
    page,
    pageSize,
    search: search ?? '',
    sortBy,
    sortDir,
    status: queryStatus,
  } as const
  const { queryKey } = submissionsQueryOptions(queryParams)
  const queryClient = useQueryClient()
  const query = useQuery(
    submissionsHookOptions(activityId, assessmentUuid, page, pageSize, search ?? '', sortBy, sortDir, status ?? 'ALL'),
  )

  return {
    submissions: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    pages: query.data?.pages ?? 1,
    page,
    setPage,
    isLoading: query.isPending,
    error: query.error ?? null,
    mutate: async () => {
      if (!assessmentUuid) return undefined
      await queryClient.invalidateQueries({ queryKey })
      return queryClient.fetchQuery(submissionsQueryOptions(queryParams))
    },
  }
}
