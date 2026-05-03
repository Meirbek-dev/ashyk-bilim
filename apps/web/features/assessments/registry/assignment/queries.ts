'use client';

import { apiFetcher } from '@/lib/api-client';
import { queryOptions } from '@tanstack/react-query';
import { getAPIUrl } from '@services/config/config';
import { queryKeys } from '@/lib/react-query/queryKeys';

import { assessmentItemToAssignmentTask, assessmentToAssignmentRead } from './models';

function normalizeAssignmentUuid(assignmentUuid: string) {
  return assignmentUuid.startsWith('assignment_') ? assignmentUuid : `assignment_${assignmentUuid}`;
}

export function assignmentDetailQueryOptions(assignmentUuid: string) {
  const canonicalAssignmentUuid = normalizeAssignmentUuid(assignmentUuid);

  return queryOptions({
    queryKey: queryKeys.assignments.detail(canonicalAssignmentUuid),
    queryFn: async () => {
      const assessment = await apiFetcher(`${getAPIUrl()}assessments/${canonicalAssignmentUuid}`);
      return assessmentToAssignmentRead(assessment as Parameters<typeof assessmentToAssignmentRead>[0]);
    },
  });
}

export function assignmentByActivityQueryOptions(activityUuid: string) {
  const canonicalActivityUuid = activityUuid.startsWith('activity_') ? activityUuid : `activity_${activityUuid}`;

  return queryOptions({
    queryKey: ['assignments', 'activity', canonicalActivityUuid],
    queryFn: async () => {
      const assessment = await apiFetcher(`${getAPIUrl()}assessments/activity/${canonicalActivityUuid}`);
      return assessmentToAssignmentRead(assessment as Parameters<typeof assessmentToAssignmentRead>[0]);
    },
  });
}

export function assignmentTasksQueryOptions(assignmentUuid: string) {
  const canonicalAssignmentUuid = normalizeAssignmentUuid(assignmentUuid);

  return queryOptions({
    queryKey: queryKeys.assignments.tasks(canonicalAssignmentUuid),
    queryFn: async () => {
      const tasks = await apiFetcher(`${getAPIUrl()}assessments/${canonicalAssignmentUuid}/assignment/tasks`);
      if (Array.isArray(tasks)) return tasks;

      const assessment = await apiFetcher(`${getAPIUrl()}assessments/${canonicalAssignmentUuid}`);
      const items = Array.isArray((assessment as { items?: unknown[] }).items)
        ? ((assessment as { items: Parameters<typeof assessmentItemToAssignmentTask>[0][] }).items ?? [])
        : [];
      return items.map(assessmentItemToAssignmentTask).filter(Boolean);
    },
  });
}
