'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  activityDetailQueryOptions,
  assignmentByActivityQueryOptions,
  assignmentDetailQueryOptions,
  assignmentTasksQueryOptions,
} from '../queries/assignments.query';
import { useCourseMetadata } from '@/features/courses/hooks/useCourseQueries';
import type { AssignmentRead } from '@/features/assignments/domain';

interface AssignmentTaskObject {
  id: number;
  assignment_task_uuid: string;
  title?: string;
  description?: string;
  assignment_type?: string;
  [key: string]: unknown;
}

interface CourseObject {
  id?: number;
  course_uuid: string;
}

interface ActivityObject {
  id?: number;
  activity_uuid: string;
  published?: boolean;
}

export interface AssignmentBundle {
  assignment_object: AssignmentRead | null;
  assignment_tasks: AssignmentTaskObject[] | null;
  course_object: CourseObject | null;
  activity_object: ActivityObject | null;
}

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

export function useAssignmentActivity(activityUuid: string | null | undefined) {
  return useQuery(activityDetailHookOptions(activityUuid));
}

export function useAssignmentBundle(assignmentUuid: string | null | undefined) {
  const {
    data: assignment,
    error: assignmentError,
    isPending: isAssignmentPending,
  } = useAssignmentDetail(assignmentUuid);
  const {
    data: assignmentTasks,
    error: assignmentTasksError,
    isPending: isAssignmentTasksPending,
  } = useAssignmentTasks(assignmentUuid);

  const courseUuid = assignment?.course_uuid;
  const { data: courseObject, error: courseObjectError, isPending: isCoursePending } = useCourseMetadata(courseUuid);

  const activityUuid = assignment?.activity_uuid;
  const {
    data: activityObject,
    error: activityObjectError,
    isPending: isActivityPending,
  } = useAssignmentActivity(activityUuid);

  const data: AssignmentBundle = useMemo(() => {
    if (assignment && assignmentTasks && (!courseUuid || courseObject) && (!activityUuid || activityObject)) {
      return {
        assignment_object: assignment,
        assignment_tasks: (assignmentTasks as AssignmentTaskObject[] | null | undefined) ?? null,
        course_object: (courseObject as CourseObject | null | undefined) ?? null,
        activity_object: (activityObject as ActivityObject | null | undefined) ?? null,
      };
    }

    return {
      assignment_object: null,
      assignment_tasks: null,
      course_object: null,
      activity_object: null,
    };
  }, [assignment, assignmentTasks, courseUuid, courseObject, activityUuid, activityObject]);

  const isPending =
    isAssignmentPending ||
    isAssignmentTasksPending ||
    Boolean(courseUuid && isCoursePending) ||
    Boolean(activityUuid && isActivityPending);

  return {
    data,
    error: assignmentError ?? assignmentTasksError ?? courseObjectError ?? activityObjectError ?? null,
    isPending,
  };
}
