'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';

import { assignmentByActivityQueryOptions, assignmentDetailQueryOptions, assignmentTasksQueryOptions } from './queries';

function assignmentDetailHookOptions(assignmentUuid: string | null | undefined) {
  const normalizedAssignmentUuid =
    typeof assignmentUuid === 'string' && assignmentUuid !== 'undefined' ? assignmentUuid : '';

  return queryOptions({
    ...assignmentDetailQueryOptions(normalizedAssignmentUuid),
    enabled: Boolean(normalizedAssignmentUuid),
  });
}

function assignmentTasksHookOptions(assignmentUuid: string | null | undefined) {
  const normalizedAssignmentUuid =
    typeof assignmentUuid === 'string' && assignmentUuid !== 'undefined' ? assignmentUuid : '';

  return queryOptions({
    ...assignmentTasksQueryOptions(normalizedAssignmentUuid),
    enabled: Boolean(normalizedAssignmentUuid),
  });
}

export function useAssignmentDetail(assignmentUuid: string | null | undefined) {
  return useQuery(assignmentDetailHookOptions(assignmentUuid));
}

export function useAssignmentByActivity(activityUuid: string | null | undefined) {
  const normalizedActivityUuid = activityUuid ?? '';

  return useQuery(
    queryOptions({
      ...assignmentByActivityQueryOptions(normalizedActivityUuid),
      enabled: Boolean(activityUuid),
    }),
  );
}

export function useAssignmentTasks(assignmentUuid: string | null | undefined) {
  return useQuery(assignmentTasksHookOptions(assignmentUuid));
}
