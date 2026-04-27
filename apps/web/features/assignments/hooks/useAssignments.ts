'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  activityDetailQueryOptions,
  assignmentDetailQueryOptions,
  assignmentTasksQueryOptions,
} from '../queries/assignments.query';

function isAssignmentUuidEnabled(assignmentUuid: string | null | undefined) {
  return Boolean(assignmentUuid && assignmentUuid !== 'undefined');
}

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

function activityDetailHookOptions(activityUuid: string | null | undefined) {
  const normalizedActivityUuid = activityUuid ?? '';

  return queryOptions({
    ...activityDetailQueryOptions(normalizedActivityUuid),
    enabled: Boolean(activityUuid),
  });
}

export function useAssignmentDetail(assignmentUuid: string | null | undefined) {
  return useQuery(assignmentDetailHookOptions(assignmentUuid));
}

export function useAssignmentTasks(assignmentUuid: string | null | undefined) {
  return useQuery(assignmentTasksHookOptions(assignmentUuid));
}

export function useAssignmentActivity(activityUuid: string | null | undefined) {
  return useQuery(activityDetailHookOptions(activityUuid));
}
