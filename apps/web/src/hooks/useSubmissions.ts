'use client';

import type { SubmissionStatus } from '@/features/grading/domain/types';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { submissionsQueryOptions } from '@/features/grading/queries/grading.query';
import { useState, useEffect } from 'react';

export interface UseSubmissionsOptions {
  activityId: number | null;
  assessmentUuid?: string | null;
  status?: SubmissionStatus | 'NEEDS_GRADING' | null;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  pageSize?: number;
}

function submissionsHookOptions(
  activityId: number | null,
  assessmentUuid: string | null | undefined,
  page: number,
  pageSize: number,
  search: string,
  sortBy: string,
  sortDir: 'asc' | 'desc',
  status: SubmissionStatus | 'NEEDS_GRADING' | 'ALL',
) {
  return queryOptions({
    ...submissionsQueryOptions({
      activityId: activityId ?? 0,
      assessmentUuid: assessmentUuid ?? undefined,
      page,
      pageSize,
      search,
      sortBy,
      sortDir,
      status,
    }),
    enabled: Boolean(activityId),
  });
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
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [activityId]);

  const queryParams = {
    activityId: activityId ?? 0,
    assessmentUuid: assessmentUuid ?? undefined,
    page,
    pageSize,
    search: search ?? '',
    sortBy,
    sortDir,
    status: status ?? 'ALL',
  } as const;
  const { queryKey } = submissionsQueryOptions(queryParams);
  const queryClient = useQueryClient();
  const query = useQuery(
    submissionsHookOptions(activityId, assessmentUuid, page, pageSize, search ?? '', sortBy, sortDir, status ?? 'ALL'),
  );

  return {
    submissions: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    pages: query.data?.pages ?? 1,
    page,
    setPage,
    isLoading: query.isPending,
    error: query.error ?? null,
    mutate: async () => {
      if (!activityId) return undefined;
      await queryClient.invalidateQueries({ queryKey });
      return queryClient.fetchQuery(submissionsQueryOptions(queryParams));
    },
  };
}
