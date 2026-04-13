'use client';

import { getAssignmentTaskSubmissionsMe } from '@services/courses/assignments';
import { apiFetcher } from '@/lib/api-client';
import { queryOptions } from '@tanstack/react-query';
import { getAPIUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';

function normalizeAssignmentUuid(assignmentUuid: string) {
  return assignmentUuid.startsWith('assignment_') ? assignmentUuid : `assignment_${assignmentUuid}`;
}

async function fetchAssignmentTaskSubmission<TTaskSubmission = unknown>(
  assignmentUuid: string,
  assignmentTaskUuid: string,
): Promise<TTaskSubmission | null> {
  const response = await getAssignmentTaskSubmissionsMe(assignmentTaskUuid, normalizeAssignmentUuid(assignmentUuid));

  if (!response.success || !response.data) {
    return null;
  }

  return response.data as TTaskSubmission;
}

export function assignmentDetailQueryOptions(assignmentUuid: string) {
  const canonicalAssignmentUuid = normalizeAssignmentUuid(assignmentUuid);

  return queryOptions({
    queryKey: queryKeys.assignments.detail(canonicalAssignmentUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}assignments/${canonicalAssignmentUuid}`),
  });
}

export function assignmentTasksQueryOptions(assignmentUuid: string) {
  const canonicalAssignmentUuid = normalizeAssignmentUuid(assignmentUuid);

  return queryOptions({
    queryKey: queryKeys.assignments.tasks(canonicalAssignmentUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}assignments/${canonicalAssignmentUuid}/tasks`),
  });
}

export function assignmentSubmissionsQueryOptions<TAssignmentSubmissionRow = unknown>(assignmentUuid: string) {
  const canonicalAssignmentUuid = normalizeAssignmentUuid(assignmentUuid);

  return queryOptions({
    queryKey: queryKeys.assignments.submissions(canonicalAssignmentUuid),
    queryFn: () =>
      apiFetcher(`${getAPIUrl()}assignments/${canonicalAssignmentUuid}/submissions`) as Promise<
        TAssignmentSubmissionRow[]
      >,
  });
}

export function assignmentTaskSubmissionQueryOptions<TTaskSubmission = unknown>(
  assignmentUuid: string,
  assignmentTaskUuid: string,
) {
  const canonicalAssignmentUuid = normalizeAssignmentUuid(assignmentUuid);

  return queryOptions({
    queryKey: queryKeys.assignments.taskSubmission(canonicalAssignmentUuid, assignmentTaskUuid),
    queryFn: () => fetchAssignmentTaskSubmission<TTaskSubmission>(canonicalAssignmentUuid, assignmentTaskUuid),
    refetchOnWindowFocus: false,
  });
}

export function activityDetailQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.activities.detail(activityUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}activities/${activityUuid}`),
  });
}
