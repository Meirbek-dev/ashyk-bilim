'use client';

import { apiFetcher } from '@/lib/api-client';
import type {
  CourseGradebookResponse,
  Submission,
  SubmissionStats,
  SubmissionStatus,
  SubmissionsPage,
} from '@/features/grading/domain';
import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';

export interface SubmissionListQueryParams {
  assessmentUuid: string;
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  status: SubmissionStatus | 'NEEDS_GRADING' | 'ALL';
}

function buildSubmissionsSearchParams(params: SubmissionListQueryParams) {
  const searchParams = new URLSearchParams();
  if (params.status !== 'ALL') searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);
  searchParams.set('sort_by', params.sortBy);
  searchParams.set('sort_dir', params.sortDir);
  searchParams.set('page', String(params.page));
  searchParams.set('page_size', String(params.pageSize));
  return searchParams.toString();
}

export function gradingDetailQueryOptions(submissionUuid: string, assessmentUuid: string) {
  return queryOptions({
    queryKey: queryKeys.grading.detail(submissionUuid, assessmentUuid),
    queryFn: () => apiFetcher<Submission>(`assessments/${assessmentUuid}/submissions/${submissionUuid}`),
    staleTime: 2000,
  });
}

export function courseGradebookQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.grading.gradebook(courseUuid),
    queryFn: () => apiFetcher<CourseGradebookResponse>(`grading/courses/${courseUuid}/gradebook`),
    staleTime: 5000,
  });
}

export function submissionStatsQueryOptions(assessmentUuid: string) {
  return queryOptions({
    queryKey: queryKeys.grading.stats(assessmentUuid),
    queryFn: () => apiFetcher<SubmissionStats>(`assessments/${assessmentUuid}/submissions/stats`),
    staleTime: 5000,
  });
}

export function submissionsQueryOptions(params: SubmissionListQueryParams) {
  return queryOptions({
    queryKey: queryKeys.grading.submissions(params),
    queryFn: () => {
      const path = `assessments/${params.assessmentUuid}/submissions`;
      return apiFetcher<SubmissionsPage>(`${path}?${buildSubmissionsSearchParams(params)}`);
    },
  });
}
