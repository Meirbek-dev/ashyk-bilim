'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  activityDetailQueryOptions,
  assignmentDetailQueryOptions,
  assignmentSubmissionsQueryOptions,
  assignmentTaskSubmissionQueryOptions,
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

function assignmentSubmissionsHookOptions<TAssignmentSubmissionRow = unknown>(
  assignmentUuid: string | null | undefined,
) {
  const normalizedAssignmentUuid =
    typeof assignmentUuid === 'string' && assignmentUuid !== 'undefined' ? assignmentUuid : '';

  return queryOptions({
    ...assignmentSubmissionsQueryOptions<TAssignmentSubmissionRow>(normalizedAssignmentUuid),
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

function assignmentTaskSubmissionHookOptions<TTaskSubmission = unknown>(
  assignmentUuid: string | null | undefined,
  assignmentTaskUuid: string | null | undefined,
) {
  const normalizedAssignmentUuid =
    typeof assignmentUuid === 'string' && assignmentUuid !== 'undefined' ? assignmentUuid : '';
  const normalizedAssignmentTaskUuid =
    typeof assignmentTaskUuid === 'string' && assignmentTaskUuid !== 'undefined' ? assignmentTaskUuid : '';

  return queryOptions({
    ...assignmentTaskSubmissionQueryOptions<TTaskSubmission>(normalizedAssignmentUuid, normalizedAssignmentTaskUuid),
    enabled: Boolean(normalizedAssignmentUuid && normalizedAssignmentTaskUuid),
  });
}

export function useAssignmentDetail(assignmentUuid: string | null | undefined) {
  return useQuery(assignmentDetailHookOptions(assignmentUuid));
}

export function useAssignmentTasks(assignmentUuid: string | null | undefined) {
  return useQuery(assignmentTasksHookOptions(assignmentUuid));
}

export function useAssignmentSubmissions<TAssignmentSubmissionRow = unknown>(
  assignmentUuid: string | null | undefined,
) {
  return useQuery(assignmentSubmissionsHookOptions<TAssignmentSubmissionRow>(assignmentUuid));
}

export function useAssignmentTaskSubmission<TTaskSubmission = unknown>(
  assignmentUuid: string | null | undefined,
  assignmentTaskUuid: string | null | undefined,
) {
  return useQuery(assignmentTaskSubmissionHookOptions<TTaskSubmission>(assignmentUuid, assignmentTaskUuid));
}

export function useAssignmentActivity(activityUuid: string | null | undefined) {
  return useQuery(activityDetailHookOptions(activityUuid));
}
