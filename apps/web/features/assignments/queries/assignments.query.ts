'use client';

import { apiFetcher } from '@/lib/api-client';
import { queryOptions } from '@tanstack/react-query';
import { getAPIUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';

function normalizeAssignmentUuid(assignmentUuid: string) {
  return assignmentUuid.startsWith('assignment_') ? assignmentUuid : `assignment_${assignmentUuid}`;
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

export function activityDetailQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.activities.detail(activityUuid),
    queryFn: () => apiFetcher(`${getAPIUrl()}activities/${activityUuid}`),
  });
}
