'use client';

import { apiFetcher } from '@/lib/api-client';
import type { GradebookResponse, Submission, SubmissionStats, SubmissionStatus, SubmissionsPage } from '@/types/grading';
import { queryOptions } from '@tanstack/react-query';
import { getAPIUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';

export interface SubmissionListQueryParams {
  activityId: number;
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  status: SubmissionStatus | 'NEEDS_GRADING' | 'ALL';
}

function buildSubmissionsSearchParams(params: SubmissionListQueryParams) {
  const searchParams = new URLSearchParams();
  searchParams.set('activity_id', String(params.activityId));
  if (params.status !== 'ALL') searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);
  searchParams.set('sort_by', params.sortBy);
  searchParams.set('sort_dir', params.sortDir);
  searchParams.set('page', String(params.page));
  searchParams.set('page_size', String(params.pageSize));
  return searchParams.toString();
}

export function gradingDetailQueryOptions(submissionUuid: string) {
  return queryOptions({
    queryKey: queryKeys.grading.detail(submissionUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}grading/submissions/${submissionUuid}`) as Promise<Submission>,
    staleTime: 2000,
  });
}

export function courseGradebookQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.grading.gradebook(courseUuid),
    queryFn: () =>
      apiFetcher(`${getAPIUrl()}grading/courses/${courseUuid}/gradebook`) as Promise<GradebookResponse>,
    staleTime: 5000,
  });
}

export function mySubmissionQueryOptions(activityId: number) {
  return queryOptions({
    queryKey: queryKeys.grading.mine(activityId),
    queryFn: () =>
      apiFetcher(`${getAPIUrl()}grading/submissions/me?activity_id=${activityId}`) as Promise<Submission[]>,
  });
}

export function submissionStatsQueryOptions(activityId: number) {
  return queryOptions({
    queryKey: queryKeys.grading.stats(activityId),
    queryFn: () =>
      apiFetcher(`${getAPIUrl()}grading/submissions/stats?activity_id=${activityId}`) as Promise<SubmissionStats>,
    staleTime: 5000,
  });
}

export function submissionsQueryOptions(params: SubmissionListQueryParams) {
  return queryOptions({
    queryKey: queryKeys.grading.submissions(params),
    queryFn: () =>
      apiFetcher(
        `${getAPIUrl()}grading/submissions?${buildSubmissionsSearchParams(params)}`,
      ) as Promise<SubmissionsPage>,
  });
}
