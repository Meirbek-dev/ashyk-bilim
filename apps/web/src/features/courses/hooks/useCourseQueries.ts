'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import type { CourseListKeyOptions } from '@/hooks/courses/courseKeys';
import {
  activityAssignmentUuidQueryOptions,
  courseListQueryOptions,
  courseMetadataQueryOptions,
  courseDiscussionsQueryOptions,
  courseUpdatesQueryOptions,
} from '../queries/course.query';

interface CourseListResponse<TCourse> {
  courses: TCourse[];
  total: number;
  summary?: {
    total: number;
    ready: number;
    private: number;
    attention: number;
  };
}

interface UseCourseDiscussionsOptions {
  enabled?: boolean;
  includeReplies?: boolean;
  limit?: number;
  offset?: number;
}

function courseDiscussionsHookOptions(
  courseUuid: string | null | undefined,
  options: UseCourseDiscussionsOptions = {},
) {
  const normalizedCourseUuid = courseUuid ?? '';
  const { enabled = true, includeReplies = false, limit = 50, offset = 0 } = options;

  return queryOptions({
    ...courseDiscussionsQueryOptions(normalizedCourseUuid, { includeReplies, limit, offset }),
    enabled: enabled && Boolean(courseUuid),
  });
}

function courseUpdatesHookOptions(courseUuid: string | null | undefined, enabled = true) {
  const normalizedCourseUuid = courseUuid ?? '';

  return queryOptions({
    ...courseUpdatesQueryOptions(normalizedCourseUuid),
    enabled: enabled && Boolean(courseUuid),
  });
}

function courseMetadataHookOptions(courseUuid: string | null | undefined) {
  const normalizedCourseUuid = courseUuid ?? '';

  return queryOptions({
    ...courseMetadataQueryOptions(normalizedCourseUuid),
    enabled: Boolean(courseUuid),
  });
}

function courseListHookOptions<TCourse = unknown>(
  options: CourseListKeyOptions = {},
  queryConfig?: { initialData?: CourseListResponse<TCourse>; staleTime?: number },
) {
  return queryOptions({
    ...courseListQueryOptions<TCourse>(options),
    ...(queryConfig?.initialData ? { initialData: queryConfig.initialData } : {}),
    ...(queryConfig?.staleTime !== undefined ? { staleTime: queryConfig.staleTime } : {}),
  });
}

function activityAssignmentUuidHookOptions(activityUuid: string | null | undefined, enabled = true) {
  const normalizedActivityUuid = activityUuid ?? '';

  return queryOptions({
    ...activityAssignmentUuidQueryOptions(normalizedActivityUuid),
    enabled: enabled && Boolean(activityUuid),
  });
}

export function useCourseDiscussions(courseUuid: string | null | undefined, options?: UseCourseDiscussionsOptions) {
  return useQuery(courseDiscussionsHookOptions(courseUuid, options));
}

export function useCourseUpdates(courseUuid: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery(courseUpdatesHookOptions(courseUuid, options?.enabled ?? true));
}

export function useCourseMetadata(courseUuid: string | null | undefined) {
  return useQuery(courseMetadataHookOptions(courseUuid));
}

export function useCourseListQuery<TCourse = unknown>(
  options: CourseListKeyOptions = {},
  queryConfig?: { initialData?: CourseListResponse<TCourse>; staleTime?: number },
) {
  return useQuery(courseListHookOptions<TCourse>(options, queryConfig));
}

export function useActivityAssignmentUuid(activityUuid: string | null | undefined, options?: { enabled?: boolean }) {
  return useQuery(activityAssignmentUuidHookOptions(activityUuid, options?.enabled ?? true));
}
