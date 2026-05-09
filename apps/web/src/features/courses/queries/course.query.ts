'use client';

import { getCourseEditorBundle } from '@services/courses/editor';
import { getAssignmentFromActivityUUID } from '@services/courses/assignments';
import { getCourses } from '@services/courses/courses';
import { getAPIUrl } from '@services/config/config';
import { apiFetcher, apiFetcherWithHeaders, fetchResponseMetadata } from '@/lib/api-client';
import { queryOptions } from '@tanstack/react-query';
import type { CourseListKeyOptions } from '@/hooks/courses/courseKeys';
import { courseEndpoints, courseKeys } from '@/hooks/courses/courseKeys';
import { queryKeys } from '@/lib/react-query/queryKeys';

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

export function courseQueryOptions<TCourse = unknown>(courseUuid: string) {
  return queryOptions({
    queryKey: courseKeys.detail(courseUuid),
    queryFn: () => apiFetcher(courseEndpoints.detail(courseUuid)) as Promise<TCourse>,
  });
}

export function courseMetadataQueryOptions<TCourse = unknown>(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.courses.metadata(courseUuid),
    queryFn: () => apiFetcher(courseEndpoints.detail(courseUuid)) as Promise<TCourse>,
  });
}

export function courseStructureQueryOptions<TCourseStructure = unknown>(
  courseUuid: string,
  withUnpublishedActivities = false,
) {
  return queryOptions({
    queryKey: courseKeys.structure(courseUuid, withUnpublishedActivities),
    queryFn: () =>
      apiFetcher(courseEndpoints.structure(courseUuid, withUnpublishedActivities)) as Promise<TCourseStructure>,
    staleTime: 5000,
  });
}

export function courseRightsQueryOptions<TRights = unknown>(courseUuid: string) {
  return queryOptions({
    queryKey: courseKeys.rights(courseUuid),
    queryFn: () => apiFetcher(courseEndpoints.rights(courseUuid)) as Promise<TRights>,
  });
}

export function courseEditorBundleQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: courseKeys.editorBundle(courseUuid) ?? ['courses', 'editor-bundle', 'missing'],
    queryFn: () => getCourseEditorBundle(courseUuid),
  });
}

export function courseListQueryOptions<TCourse = unknown>(options: CourseListKeyOptions = {}) {
  return queryOptions({
    queryKey: courseKeys.list(options),
    queryFn: async (): Promise<CourseListResponse<TCourse>> => {
      const response = await apiFetcherWithHeaders(courseEndpoints.list(options));
      return {
        courses: Array.isArray(response.data) ? response.data : [],
        total: Number.parseInt(response.headers['x-total-count'] ?? '0', 10),
      };
    },
  });
}

export function editableCourseListQueryOptions<TCourse = unknown>(options: CourseListKeyOptions = {}) {
  return queryOptions({
    queryKey: courseKeys.editable(options),
    queryFn: async (): Promise<CourseListResponse<TCourse>> => {
      const response = await apiFetcherWithHeaders(courseEndpoints.editable(options));
      return {
        courses: Array.isArray(response.data) ? response.data : [],
        total: Number.parseInt(response.headers['x-total-count'] ?? '0', 10),
        summary: {
          total: Number.parseInt(response.headers['x-summary-total'] ?? response.headers['x-total-count'] ?? '0', 10),
          ready: Number.parseInt(response.headers['x-summary-ready'] ?? '0', 10),
          private: Number.parseInt(response.headers['x-summary-private'] ?? '0', 10),
          attention: Number.parseInt(response.headers['x-summary-attention'] ?? '0', 10),
        },
      };
    },
  });
}

export function courseUpdatesQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.courses.updates(courseUuid),
    queryFn: () => apiFetcher(`${courseEndpoints.detail(courseUuid)}/updates`),
  });
}

export function courseDiscussionsQueryOptions(
  courseUuid: string,
  options: { includeReplies?: boolean; limit?: number; offset?: number } = {},
) {
  const { includeReplies = false, limit = 50, offset = 0 } = options;

  return queryOptions({
    queryKey: queryKeys.discussions.list(courseUuid, includeReplies, limit, offset),
    queryFn: () => {
      const queryString = new URLSearchParams({
        include_replies: String(includeReplies),
        limit: String(limit),
        offset: String(offset),
      }).toString();

      return apiFetcher(`${courseEndpoints.detail(courseUuid)}/discussions?${queryString}`);
    },
  });
}

export function trailCurrentQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.trail.current(),
    queryFn: () => apiFetcher(`${getAPIUrl()}trail`),
  });
}

export function trailLeaderboardQueryOptions(limit = 10) {
  return queryOptions({
    queryKey: queryKeys.trail.leaderboard(limit),
    queryFn: () => apiFetcher(`${getAPIUrl()}gamification/leaderboard?limit=${limit}`),
  });
}

export function userCertificatesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.certifications.userAll(),
    queryFn: () => apiFetcher(`${getAPIUrl()}certifications/user/all`),
  });
}

export function userCourseCertificatesQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.certifications.course(courseUuid),
    queryFn: () => fetchResponseMetadata(`${getAPIUrl()}certifications/user/course/${courseUuid}`),
  });
}

export function certificateDetailQueryOptions(certificateUuid: string) {
  return queryOptions({
    queryKey: queryKeys.certifications.detail(certificateUuid),
    queryFn: () => fetchResponseMetadata(`${getAPIUrl()}certifications/certificate/${certificateUuid}`),
  });
}

export function courseContributorsQueryOptions(courseUuid: string) {
  return queryOptions({
    queryKey: queryKeys.courses.contributors(courseUuid),
    queryFn: () => fetchResponseMetadata(`${getAPIUrl()}courses/${courseUuid}/contributors`),
  });
}

export function activityAssignmentUuidQueryOptions(activityUuid: string) {
  return queryOptions({
    queryKey: queryKeys.assignments.activity(activityUuid),
    queryFn: async () => {
      const result = await getAssignmentFromActivityUUID(activityUuid);
      return result?.data?.assignment_uuid?.replace('assignment_', '') ?? null;
    },
  });
}

export function platformCoursesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.platform.courses(),
    queryFn: () => getCourses(),
  });
}
